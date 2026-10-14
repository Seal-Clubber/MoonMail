use ghostdrop_v3::ghostdrop_v3::MailboxState;
use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, transaction::args};

#[test]
fn only_the_registered_controller_can_create_and_update_mailbox_state_and_stale_writes_fail() {
    let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../ghostdrop-v3"]);
    t.disable_fees();
    let office: ComponentAddress = t.call_function(
        "GhostDrop",
        "new",
        args![16u8, t.get_template_address("GhostDrop")],
        vec![],
    );
    t.call_method::<()>(
        office,
        "create_postbox",
        args![
            "home".to_string(),
            "Home".to_string(),
            "test-key".to_string(),
            true
        ],
        vec![],
    );
    let directory = office;
    let foreign = t.new_key_pair(77).0;
    let denied = t.execute_expect_failure(
        t.transaction()
            .call_method(
                directory,
                "open_mailbox",
                args!["home".to_string(), "opaque-initial-ciphertext".to_string()],
            )
            .build_and_seal(&foreign),
        vec![],
    );
    assert!(denied.to_string().contains("signer badge"), "{denied}");
    let absent: Option<ComponentAddress> = t.call_method(
        directory,
        "mailbox_address",
        args!["home".to_string()],
        vec![],
    );
    assert!(absent.is_none());
    let child: ComponentAddress = t.call_method(
        directory,
        "open_mailbox",
        args!["home".to_string(), "opaque-initial-ciphertext".to_string()],
        vec![],
    );
    let first: MailboxState = state(&mut t, child);
    assert_eq!(first.registry, directory);
    assert_eq!(first.revision, 1);
    assert_eq!(first.controller, t.to_public_key_bytes());
    t.call_method::<()>(
        child,
        "set_ciphertext",
        args![1u64, "encrypted-revision-two".to_string()],
        vec![],
    );
    for (revision, ciphertext, key, reason) in [
        (
            2u64,
            "foreign-write".to_string(),
            foreign.clone(),
            "signer badge",
        ),
        (
            1u64,
            "stale-device".to_string(),
            t.secret_key().clone(),
            "Mailbox state changed",
        ),
        (
            2u64,
            String::new(),
            t.secret_key().clone(),
            "Mailbox ciphertext exceeds limit",
        ),
        (
            2u64,
            "x".repeat(98305),
            t.secret_key().clone(),
            "Mailbox ciphertext exceeds limit",
        ),
    ] {
        let rejected = t.execute_expect_failure(
            t.transaction()
                .call_method(child, "set_ciphertext", args![revision, ciphertext])
                .build_and_seal(&key),
            vec![],
        );
        assert!(rejected.to_string().contains(reason), "{rejected}");
        let current: MailboxState = state(&mut t, child);
        assert_eq!(current.revision, 2);
        assert_eq!(current.ciphertext, "encrypted-revision-two");
    }
    let duplicate = t.execute_expect_failure(
        t.transaction()
            .call_method(
                directory,
                "open_mailbox",
                args!["home".to_string(), "duplicate".to_string()],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(duplicate.to_string().contains("Mailbox already exists"));
    let current: Option<ComponentAddress> = t.call_method(
        directory,
        "mailbox_address",
        args!["home".to_string()],
        vec![],
    );
    assert_eq!(current, Some(child));
    if let Ok(path) = std::env::var("MAILBOX_STATE_FIXTURE") {
        assert!(path.ends_with(".local.json"));
        let mut substates = serde_json::Map::new();
        t.read_only_state_store()
            .with_substates(|id, value| {
                if [office.to_string(), child.to_string()].contains(&id.to_string()) {
                    substates.insert(id.to_string(), serde_json::to_value(value).unwrap());
                }
            })
            .unwrap();
        let fixture = serde_json::json!({"engine":"0.45.0","publicTransactions":0,"registry":office.to_string(),"component":child.to_string(),"template":t.get_template_address("GhostDrop").to_string(),"controller":t.to_public_key_bytes().to_string(),"substates":substates});
        std::fs::write(path, serde_json::to_string_pretty(&fixture).unwrap()).unwrap();
    }
    let unknown = t.execute_expect_failure(
        t.transaction()
            .call_method(
                directory,
                "open_mailbox",
                args!["unknown".to_string(), "opaque".to_string()],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(unknown.to_string().contains("Unknown postbox"));
}

#[test]
fn mailbox_state_checks_directory_identity_separates_postboxes_and_accepts_bounded_ciphertext() {
    let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../ghostdrop-v3"]);
    t.disable_fees();
    let office: ComponentAddress = t.call_function(
        "GhostDrop",
        "new",
        args![16u8, t.get_template_address("GhostDrop")],
        vec![],
    );
    let directory = office;
    for id in ["one", "two"] {
        t.call_method::<()>(
            office,
            "create_postbox",
            args![id.to_string(), id.to_string(), "key".to_string(), false],
            vec![],
        );
    }
    let first: ComponentAddress = t.call_method(
        directory,
        "open_mailbox",
        args!["one".to_string(), "a".repeat(98304)],
        vec![],
    );
    let second: ComponentAddress = t.call_method(
        directory,
        "open_mailbox",
        args!["two".to_string(), "second".to_string()],
        vec![],
    );
    assert_ne!(first, second);
    t.call_method::<()>(
        second,
        "set_ciphertext",
        args![1u64, "second-updated".to_string()],
        vec![],
    );
    let unaffected: MailboxState = state(&mut t, first);
    assert_eq!(unaffected.revision, 1);
    assert_eq!(unaffected.ciphertext.len(), 98304);
    let no_root_update = t.execute_expect_failure(
        t.transaction()
            .call_method(directory, "set_ciphertext", args![0u64, "bad".to_string()])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(no_root_update.to_string().contains("Mailbox only"));
    let no_child_create = t.execute_expect_failure(
        t.transaction()
            .call_method(
                first,
                "open_mailbox",
                args!["two".to_string(), "bad".to_string()],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(no_child_create.to_string().contains("Post office only"));
}

fn state(t: &mut TemplateTest, component: ComponentAddress) -> MailboxState {
    t.execute_expect_success(
        t.transaction()
            .call_method(component, "get_mailbox", args![])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    t.expect_return(0)
}

#[test]
fn unified_letters_allow_long_messages_but_enforce_complete_component_size_and_kind_boundaries() {
    let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../ghostdrop-v3"]);
    t.disable_fees();
    let template = t.get_template_address("GhostDrop");
    let bad = t.execute_expect_failure(
        t.transaction()
            .call_function(
                template,
                "new",
                args![
                    16u8,
                    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                        .parse::<TemplateAddress>()
                        .unwrap()
                ],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(bad.to_string().contains("Wrong unified template"));
    let office: ComponentAddress =
        t.call_function("GhostDrop", "new", args![16u8, template], vec![]);
    let (sender, proof, key) = t.create_funded_account();
    for (id, size, valid) in [("long", 16000, true), ("full", 32768, false)] {
        let tx = t
            .transaction()
            .call_method(sender, "withdraw", args![TARI_TOKEN, Amount::zero()])
            .put_last_instruction_output_on_workspace("funding")
            .call_method(
                office,
                "publish",
                args![
                    id.to_string(),
                    0u8,
                    "x".repeat(size),
                    0u64,
                    0u64,
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    Workspace("funding")
                ],
            )
            .build_and_seal(&key);
        if valid {
            t.execute_expect_success(tx, vec![proof.clone()]);
        } else {
            let error = t.execute_expect_failure(tx, vec![proof.clone()]);
            assert!(error.to_string().contains("32 KiB"));
        }
    }
    let child: ComponentAddress =
        t.call_method(office, "letter", args!["long".to_string()], vec![]);
    t.execute_expect_success(
        t.transaction()
            .call_method(child, "get", args![])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    let letter: ghostdrop_v3::letter::letter::Envelope = t.expect_return(0);
    assert_eq!(letter.payload.len(), 16000);
    let error = t.execute_expect_failure(
        t.transaction()
            .call_method(
                child,
                "create_postbox",
                args![
                    "bad".to_string(),
                    "bad".to_string(),
                    "key".to_string(),
                    true
                ],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(error.to_string().contains("Post office only"));
    let error = t.execute_expect_failure(
        t.transaction()
            .call_method(
                child,
                "set_ciphertext",
                args![1u64, "wrong-kind".to_string()],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    assert!(error.to_string().contains("Mailbox only"));
}

#[test]
#[ignore = "requires Node/tsx; production metadata transaction builder and WASM signing bridge"]
fn sdk_mailbox_transactions_pay_normal_wallet_fees_and_cannot_replay_a_stale_update() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use tari_template_test_tooling::transaction::Transaction;
    let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../ghostdrop-v3"]);
    t.disable_fees();
    let template = t.get_template_address("GhostDrop");
    let office: ComponentAddress =
        t.call_function("GhostDrop", "new", args![16u8, template], vec![]);
    let (account, proof, key) = t.create_funded_account();
    t.execute_expect_success(
        t.transaction()
            .call_method(
                office,
                "create_postbox",
                args![
                    "home".to_string(),
                    "Home".to_string(),
                    "key".to_string(),
                    true
                ],
            )
            .build_and_seal(&key),
        vec![proof.clone()],
    );
    let node = std::env::var("GHOSTDROP_TEST_NODE").unwrap_or("node".into());
    let loader = std::env::var("GHOSTDROP_TEST_LOADER").unwrap_or("tsx".into());
    let script = std::env::var("GHOSTDROP_MAILBOX_SIGNER").unwrap_or_else(|_| {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tools/sign-mailbox-engine-update.ts")
            .to_string_lossy()
            .into_owned()
    });
    let mut component: Option<ComponentAddress> = None;
    for (revision, value, success) in [
        ("0", "first-encrypted-snapshot", true),
        ("1", "second-encrypted-snapshot", true),
        ("1", "stale-device", false),
    ] {
        let input = serde_json::json!({"deployment":{"network":16,"registry":office.to_string(),"template":template.to_string(),"envelopeTemplate":template.to_string(),"contractProtocol":"unified-1"},"account":account.to_string(),"secret":key.reveal().to_string(),"revision":revision,"ciphertext":value,"component":component.map(|c|c.to_string()),"inputs":[]});
        let mut child = Command::new(&node)
            .args(["--experimental-wasm-modules", "--import", &loader, &script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.to_string().as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "SDK bridge failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let output: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        let hex = output["bor"].as_str().unwrap();
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        let tx: Transaction = tari_bor::decode(&bytes).unwrap();
        assert!(tx.verify_all_signatures());
        t.enable_fees();
        if success {
            t.execute_expect_success(tx, vec![proof.clone()]);
        } else {
            let result = t.execute_expect_failure(tx, vec![proof.clone()]);
            assert!(result.to_string().contains("Mailbox state changed"));
        }
        t.disable_fees();
        component = t.call_method(office, "mailbox_address", args!["home".to_string()], vec![]);
    }
    let saved = state(&mut t, component.unwrap());
    assert_eq!(saved.revision, 2);
    assert_eq!(saved.ciphertext, "second-encrypted-snapshot");
}
