use moonmail_v4::moonmail_v4::SealedLetter;
use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, transaction::args};

fn fixture() -> (TemplateTest, ComponentAddress) {
    let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../moonmail-v4"]);
    t.disable_fees();
    let office = t.call_function(
        "MoonMail",
        "new",
        args![16u8, t.get_template_address("MoonMail")],
        vec![],
    );
    (t, office)
}
fn payload() -> String {
    serde_json::json!({"version":"mm-sealed-1","ephemeralPublicKey":"01".repeat(32),"iv":"A".repeat(16),"ciphertext":"A".repeat(1387)}).to_string()
}
#[test]
fn opaque_sealed_delivery_persists_without_recipient_or_conversation_fields() {
    let (mut t, office) = fixture();
    let id = "ab".repeat(32);
    t.call_method::<()>(
        office,
        "publish_sealed",
        args![id.clone(), payload()],
        vec![],
    );
    let child: ComponentAddress = t.call_method(office, "sealed_letter", args![id.clone()], vec![]);
    let state: SealedLetter = sealed_state(&mut t, child);
    assert_eq!(state.id, id);
    assert_eq!(state.registry, office);
    assert_eq!(state.network, 16);
    assert_eq!(state.sender, t.to_public_key_bytes());
    assert_eq!(state.payload, payload());
    let list: Vec<(String, ComponentAddress)> = t.call_method(
        office,
        "list_sealed_letters",
        args![String::new(), 50u32],
        vec![],
    );
    assert_eq!(list, vec![(id, child)]);
    let ordinary: Vec<(String, ComponentAddress)> =
        t.call_method(office, "list_letters", args![String::new(), 50u32], vec![]);
    assert!(ordinary.is_empty());
}
#[test]
fn public_routing_fields_and_invalid_shape_are_rejected_before_storage() {
    let (mut t, office) = fixture();
    let mut cases = Vec::new();
    for field in [
        "recipientPostbox",
        "recipientKey",
        "controller",
        "capsule",
        "replyPostbox",
        "conversation",
        "gift",
    ] {
        let mut value: serde_json::Value = serde_json::from_str(&payload()).unwrap();
        value[field] = serde_json::json!("exposed");
        cases.push(value.to_string());
    }
    cases.push(payload().replace("mm-sealed-1", "gd-postbox-1"));
    cases.push(payload().replace(&"A".repeat(1387), "short"));
    cases.push(payload().replace(&"01".repeat(32), &"00".repeat(32)));
    for value in cases {
        t.execute_expect_failure(
            t.transaction()
                .call_method(office, "publish_sealed", args!["ab".repeat(32), value])
                .build_and_seal(t.secret_key()),
            vec![],
        );
        let list: Vec<(String, ComponentAddress)> = t.call_method(
            office,
            "list_sealed_letters",
            args![String::new(), 50u32],
            vec![],
        );
        assert!(
            list.is_empty(),
            "Invalid ciphertext must not enter the directory"
        );
    }
}
#[test]
fn duplicate_delivery_and_cross_component_mutation_cannot_replace_ciphertext() {
    let (mut t, office) = fixture();
    let id = "ab".repeat(32);
    t.call_method::<()>(
        office,
        "publish_sealed",
        args![id.clone(), payload()],
        vec![],
    );
    let child: ComponentAddress = t.call_method(office, "sealed_letter", args![id.clone()], vec![]);
    t.execute_expect_failure(
        t.transaction()
            .call_method(office, "publish_sealed", args![id.clone(), payload()])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    t.execute_expect_failure(
        t.transaction()
            .call_method(child, "publish_sealed", args!["cd".repeat(32), payload()])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    t.execute_expect_failure(
        t.transaction()
            .call_method(
                child,
                "set_ciphertext",
                args![0u64, "overwritten".to_string()],
            )
            .build_and_seal(t.secret_key()),
        vec![],
    );
    let state: SealedLetter = sealed_state(&mut t, child);
    assert_eq!(state.payload, payload());
}
#[test]
fn sealed_discovery_is_paged_and_never_accepts_unbounded_scans() {
    let (mut t, office) = fixture();
    for id in ["ab".repeat(32), "cd".repeat(32)] {
        t.call_method::<()>(office, "publish_sealed", args![id, payload()], vec![]);
    }
    let first: Vec<(String, ComponentAddress)> = t.call_method(
        office,
        "list_sealed_letters",
        args![String::new(), 1u32],
        vec![],
    );
    let second: Vec<(String, ComponentAddress)> = t.call_method(
        office,
        "list_sealed_letters",
        args![first[0].0.clone(), 1u32],
        vec![],
    );
    assert_eq!(first[0].0, "ab".repeat(32));
    assert_eq!(second[0].0, "cd".repeat(32));
    for limit in [0u32, 51u32] {
        t.execute_expect_failure(
            t.transaction()
                .call_method(office, "list_sealed_letters", args![String::new(), limit])
                .build_and_seal(t.secret_key()),
            vec![],
        );
    }
}

fn sealed_state(t: &mut TemplateTest, child: ComponentAddress) -> SealedLetter {
    t.execute_expect_success(
        t.transaction()
            .call_method(child, "get_sealed", args![])
            .build_and_seal(t.secret_key()),
        vec![],
    );
    t.expect_return(0)
}

#[test]
fn upgraded_browser_crypto_recovers_a_real_engine_persisted_sealed_route() {
    let (mut t, office) = fixture();
    let id = "ef".repeat(32);
    let context = serde_json::json!({"network":16,"registry":office.to_string(),"template":t.get_template_address("MoonMail").to_string(),"senderPublicKey":t.to_public_key_bytes().to_string()});
    let payload = crypto_fixture("create", serde_json::json!({"context":context,"id":id}));
    for marker in [
        "private-engine-inbox",
        "Native sealed delivery",
        "conversation",
        "recipientKey",
        "capsule",
    ] {
        assert!(
            !payload.contains(marker),
            "Published route exposed {marker}"
        );
    }
    t.call_method::<()>(office, "publish_sealed", args![id.clone(), payload], vec![]);
    let child: ComponentAddress = t.call_method(office, "sealed_letter", args![id.clone()], vec![]);
    let state = sealed_state(&mut t, child);
    let result = crypto_fixture(
        "open",
        serde_json::json!({"context":context,"id":id,"payload":serde_json::from_str::<serde_json::Value>(&state.payload).unwrap()}),
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&result).unwrap()["recovered"],
        true
    );
}
fn crypto_fixture(command: &str, value: serde_json::Value) -> String {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };
    let node = std::env::var("GHOSTDROP_TEST_NODE").unwrap_or_else(|_| "node".to_string());
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let loader = std::env::var("GHOSTDROP_TEST_LOADER").unwrap_or_else(|_| {
        root.join("node_modules/tsx/dist/loader.mjs")
            .to_string_lossy()
            .into_owned()
    });
    let helper = std::env::var("MOONMAIL_SEALED_FIXTURE").unwrap_or_else(|_| {
        root.join("tools/sealed-engine-fixture.ts")
            .to_string_lossy()
            .into_owned()
    });
    let mut child = Command::new(node)
        .args(["--import", &loader, &helper, command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(value.to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

#[test]
fn copied_ciphertext_cannot_impersonate_the_original_transaction_sender() {
    let (mut t, office) = fixture();
    let id = "ef".repeat(32);
    let mut context = serde_json::json!({"network":16,"registry":office.to_string(),"template":t.get_template_address("MoonMail").to_string(),"senderPublicKey":t.to_public_key_bytes().to_string()});
    let payload = crypto_fixture("create", serde_json::json!({"context":context,"id":id}));
    let foreign = t.new_key_pair(77).0;
    t.execute_expect_success(
        t.transaction()
            .call_method(office, "publish_sealed", args![id.clone(), payload])
            .build_and_seal(&foreign),
        vec![],
    );
    let child: ComponentAddress = t.call_method(office, "sealed_letter", args![id.clone()], vec![]);
    let state = sealed_state(&mut t, child);
    assert_ne!(state.sender, t.to_public_key_bytes());
    context["senderPublicKey"] = serde_json::json!(state.sender.to_string());
    let result = crypto_fixture(
        "reject",
        serde_json::json!({"context":context,"id":id,"payload":serde_json::from_str::<serde_json::Value>(&state.payload).unwrap()}),
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&result).unwrap()["rejected"],
        true
    );
}
