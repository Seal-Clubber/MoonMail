#[cfg(test)]
mod tests {
    use ghostdrop_envelope::envelope::Envelope;
    use tari_template_lib::prelude::*;
    use tari_template_test_tooling::{
        TemplateTest,
        byte_type::ToByteType,
        crypto::RistrettoSecretKey,
        transaction::{Transaction, args},
    };
    fn fixture() -> (TemplateTest, ComponentAddress, ComponentAddress) {
        let mut t = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["../ghostdrop", "../envelope"]);
        let child = t.get_template_address("Envelope");
        let office: ComponentAddress =
            t.call_function("PostOffice", "new", args![16u8, child], vec![]);
        let (destination, _, _) = t.create_empty_account();
        publish(
            &mut t,
            office,
            "gift",
            0,
            String::new(),
            String::new(),
            1_000_000,
            1_000_000,
        );
        (t, office, destination)
    }
    fn publish(
        t: &mut TemplateTest,
        office: ComponentAddress,
        id: &str,
        mode: u8,
        key: String,
        recipient: String,
        gift: u64,
        reserve: u64,
    ) {
        t.disable_fees();
        let (sender, proof, sk) = t.create_funded_account();
        t.execute_expect_success(
            t.transaction()
                .call_method(
                    sender,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(gift + reserve)],
                )
                .put_last_instruction_output_on_workspace("funding")
                .call_method(
                    office,
                    "publish",
                    args![
                        id.to_string(),
                        mode,
                        "{\"subject\":\"hello\",\"body\":\"world\"}".to_string(),
                        gift,
                        reserve,
                        key,
                        recipient,
                        String::new(),
                        if mode == 0 {
                            "test".to_string()
                        } else {
                            String::new()
                        },
                        Workspace("funding")
                    ],
                )
                .build_and_seal(&sk),
            vec![proof],
        );
    }
    fn child(t: &mut TemplateTest, office: ComponentAddress, id: &str) -> ComponentAddress {
        t.disable_fees();
        t.call_method(office, "letter", args![id.to_string()], vec![])
    }
    fn get<T: for<'b> tari_bor::Decode<'b, ()>>(
        t: &mut TemplateTest,
        address: ComponentAddress,
        method: &str,
        args: Vec<tari_template_test_tooling::transaction::builder::named_args::NamedArg>,
    ) -> T {
        t.disable_fees();
        t.execute_expect_success(
            t.transaction()
                .call_method(address, method, args)
                .build_and_seal(t.secret_key()),
            vec![],
        );
        // Ootle 0.46 receipts omit return values. Only the test harness captures them.
        t.expect_return(0)
    }
    fn letter(t: &mut TemplateTest, office: ComponentAddress, id: &str) -> Envelope {
        let c = child(t, office, id);
        get(t, c, "get", args![])
    }
    fn gift_balance(t: &mut TemplateTest, office: ComponentAddress, id: &str) -> Amount {
        let c = child(t, office, id);
        get(t, c, "gift_balance", args![])
    }
    fn claim(
        t: &mut TemplateTest,
        office: ComponentAddress,
        id: &str,
        destination: ComponentAddress,
        network: u8,
        key: Option<&RistrettoSecretKey>,
        fail_main: bool,
    ) -> Transaction {
        let c = child(t, office, id);
        t.enable_fees();
        let mut b = t.transaction().with_fee_instructions_builder(|b| {
            b.call_method(c, "claim_and_pay_fee", args![destination, network])
        });
        if fail_main {
            b = b.call_method(c, "missing_method", args![]);
        }
        b.build_and_seal(key.unwrap_or(t.secret_key()))
    }
    fn balance(t: &TemplateTest, destination: ComponentAddress) -> Amount {
        t.read_only_state_store()
            .get_vaults_for_account(destination)
            .unwrap()
            .get(&TARI_TOKEN)
            .map(|v| v.balance())
            .unwrap_or(Amount::zero())
    }
    #[test]
    fn public_guest_delivers_once() {
        let (mut t, office, destination) = fixture();
        let tx = claim(&mut t, office, "gift", destination, 16, None, false);
        t.execute_expect_success(tx, vec![]);
        let e = letter(&mut t, office, "gift");
        assert!(e.claimed);
        // The archived template uses lib_types 0.33; compare the full canonical identity.
        assert_eq!(
            e.destination.map(|address| address.to_string()),
            Some(destination.to_string())
        );
        assert_eq!(balance(&t, destination), Amount::from(1_000_000u64));
        let tx = claim(&mut t, office, "gift", destination, 16, None, false);
        t.execute_expect_failure(tx, vec![]);
    }
    #[test]
    fn failed_main_intent_preserves_payout_and_consumes_claim_once() {
        let (mut t, office, destination) = fixture();
        let tx = claim(&mut t, office, "gift", destination, 16, None, true);
        let r = t.execute_and_commit_on_success(tx, vec![]);
        r.expect_failure();
        r.expect_finalization_success();
        assert!(letter(&mut t, office, "gift").claimed);
        assert_eq!(balance(&t, destination), Amount::from(1_000_000u64));
    }
    #[test]
    fn private_link_authority_freezes_at_funding_and_wrong_signers_cannot_drain_fees() {
        let (mut t, office, destination) = fixture();
        let (sk, pk) = t.new_key_pair(42);
        publish(
            &mut t,
            office,
            "private",
            1,
            pk.to_byte_type().to_string(),
            String::new(),
            1_000_000,
            1_000_000,
        );
        let initial = gift_balance(&mut t, office, "private");
        for _ in 0..3 {
            let tx = claim(&mut t, office, "private", destination, 16, None, false);
            t.execute_expect_failure(tx, vec![]);
            assert_eq!(initial, gift_balance(&mut t, office, "private"));
        }
        let tx = claim(&mut t, office, "private", destination, 16, Some(&sk), false);
        t.execute_expect_success(tx, vec![]);
        let e = letter(&mut t, office, "private");
        assert!(e.claimed);
        // The archived template uses lib_types 0.33; compare the full canonical identity.
        assert_eq!(
            e.destination.map(|address| address.to_string()),
            Some(destination.to_string())
        );
        let tx = claim(&mut t, office, "private", destination, 16, Some(&sk), false);
        t.execute_expect_failure(tx, vec![]);
    }
    #[test]
    fn incorrect_network_and_non_account_destination_leave_gift_intact() {
        let (mut t, office, destination) = fixture();
        let initial = gift_balance(&mut t, office, "gift");
        for (target, network) in [(destination, 38u8), (office, 16u8)] {
            let tx = claim(&mut t, office, "gift", target, network, None, false);
            t.execute_expect_failure(tx, vec![]);
            assert_eq!(initial, gift_balance(&mut t, office, "gift"));
            assert!(!letter(&mut t, office, "gift").claimed);
        }
    }
    #[test]
    fn insufficient_fee_checkpoint_rolls_back_the_deposit_and_claim() {
        let (mut t, office, destination) = fixture();
        publish(
            &mut t,
            office,
            "too-small",
            0,
            String::new(),
            String::new(),
            1_000_000,
            1,
        );
        let tx = claim(&mut t, office, "too-small", destination, 16, None, false);
        t.execute_expect_failure(tx, vec![]);
        assert!(!letter(&mut t, office, "too-small").claimed);
        assert_eq!(
            gift_balance(&mut t, office, "too-small"),
            Amount::from(1_000_001u64)
        );
        assert_eq!(balance(&t, destination), Amount::zero());
    }
    #[test]
    fn two_racing_holders_can_pay_only_one_destination() {
        let (mut t, office, first) = fixture();
        let (second, _, _) = t.create_empty_account();
        let tx = claim(&mut t, office, "gift", first, 16, None, false);
        t.execute_expect_success(tx, vec![]);
        let tx = claim(&mut t, office, "gift", second, 16, None, false);
        t.execute_expect_failure(tx, vec![]);
        assert_eq!(balance(&t, second), Amount::zero());
    }
    #[test]
    fn postbox_ids_survive_rename_and_controller_rejects_other_wallet() {
        let (mut t, office, destination) = fixture();
        for id in ["box-1", "box-2"] {
            t.call_method::<()>(
                office,
                "create_postbox",
                args![
                    id.to_string(),
                    "Duplicate nickname".to_string(),
                    "test-encryption-public-key".to_string(),
                    true
                ],
                vec![],
            );
        }
        t.call_method::<()>(
            office,
            "edit_postbox",
            args!["box-1".to_string(), "Renamed".to_string(), false],
            vec![],
        );
        let p: ghostdrop_template::ghostdrop::Postbox =
            get(&mut t, office, "postbox", args!["box-1".to_string()]);
        assert_eq!(p.id, "box-1");
        assert_eq!(p.nickname, "Renamed");
        assert!(!p.discoverable);
        let (sk, _) = t.new_key_pair(77);
        t.execute_expect_failure(
            t.transaction()
                .call_method(
                    office,
                    "rotate_postbox_key",
                    args!["box-1".to_string(), "attacker-key".to_string()],
                )
                .build_and_seal(&sk),
            vec![],
        );
        t.call_method::<()>(
            office,
            "rotate_postbox_key",
            args!["box-1".to_string(), "version-two-public-key".to_string()],
            vec![],
        );
        let rotated: ghostdrop_template::ghostdrop::Postbox =
            get(&mut t, office, "postbox", args!["box-1".to_string()]);
        assert_eq!(rotated.controller, p.controller);
        assert_eq!(rotated.id, p.id);
        assert_eq!(rotated.encryption_key, "version-two-public-key");
        t.execute_expect_failure(
            t.transaction()
                .call_method(
                    office,
                    "edit_postbox",
                    args!["box-1".to_string(), "Hijack".to_string(), true],
                )
                .build_and_seal(&sk),
            vec![],
        );
        publish(
            &mut t,
            office,
            "addressed",
            2,
            p.controller.to_string(),
            p.id,
            1_000_000,
            1_000_000,
        );
        let tx = claim(
            &mut t,
            office,
            "addressed",
            destination,
            16,
            Some(&sk),
            false,
        );
        t.execute_expect_failure(tx, vec![]);
        let tx = claim(&mut t, office, "addressed", destination, 16, None, false);
        t.execute_expect_success(tx, vec![]);
        let p2: ghostdrop_template::ghostdrop::Postbox =
            get(&mut t, office, "postbox", args!["box-2".to_string()]);
        assert_eq!(p2.controller, p.controller);
    }
    #[test]
    fn later_letters_cannot_change_existing_gift_state_or_reserve() {
        let (mut t, office, _) = fixture();
        let c = child(&mut t, office, "gift");
        let before = t.read_only_state_store().get_component(c).unwrap();
        publish(
            &mut t,
            office,
            "another",
            0,
            String::new(),
            String::new(),
            1_000_000,
            1_000_000,
        );
        let after = t.read_only_state_store().get_component(c).unwrap();
        assert_eq!(
            tari_bor::encode(&before).unwrap(),
            tari_bor::encode(&after).unwrap()
        );
        publish(
            &mut t,
            office,
            "text-only",
            0,
            String::new(),
            String::new(),
            0,
            0,
        );
        assert_eq!(letter(&mut t, office, "text-only").gift, 0);
    }
    #[test]
    fn export_real_engine_state_for_browser_codec_tests() {
        let (mut t, office, _) = fixture();
        let c = child(&mut t, office, "gift");
        let component = t.read_only_state_store().get_component(office).unwrap();
        let envelope = t.read_only_state_store().get_component(c).unwrap();
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("engine-office.json"),serde_json::to_string_pretty(&serde_json::json!({"registry":office.to_string(),"template":component.header.template_address.to_string(),"envelopeTemplate":envelope.header.template_address.to_string(),"component":component,"envelopes":{c.to_string():envelope}})).unwrap()).unwrap();
    }
    fn js_transaction(f: serde_json::Value) -> (Transaction, serde_json::Value) {
        use std::{
            io::Write,
            process::{Command, Stdio},
        };
        let node = std::env::var("GHOSTDROP_TEST_NODE").unwrap_or("node".into());
        let loader = std::env::var("GHOSTDROP_TEST_LOADER").unwrap_or("tsx".into());
        let script = std::env::var("GHOSTDROP_TEST_SIGNER").unwrap_or_else(|_| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../tools/sign-engine-claim.ts")
                .to_string_lossy()
                .into_owned()
        });
        let mut process = Command::new(node)
            .args(["--experimental-wasm-modules", "--import", &loader, &script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("start isolated SDK signer");
        process
            .stdin
            .take()
            .unwrap()
            .write_all(serde_json::to_string(&f).unwrap().as_bytes())
            .unwrap();
        let result = process.wait_with_output().unwrap();
        assert!(
            result.status.success(),
            "SDK signer failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        let output: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        let tx: Transaction = serde_json::from_value(output["json"].clone())
            .expect("official SDK JSON decodes as Rust transaction");
        let hex = output["bor"].as_str().unwrap();
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        let decoded: Transaction =
            tari_bor::decode(&bytes).expect("submission BOR decodes in Rust");
        assert_eq!(decoded.calculate_id(), tx.calculate_id());
        assert!(
            tx.verify_all_signatures(),
            "Rust verifies every WASM signature and seal"
        );
        let mut modified = output["json"].clone();
        modified["V1"]["body"]["transaction"]["max_epoch"] = serde_json::json!(11);
        let altered: Transaction =
            serde_json::from_value(modified).expect("tampered transaction still decodes");
        assert!(!altered.verify_all_signatures());
        (tx, output)
    }
    #[test]
    #[ignore = "requires Node and tsx; run explicitly after installing JS dependencies"]
    fn javascript_signed_link_claim_executes_and_tampering_fails() {
        let (mut t, office, destination) = fixture();
        let (sk, pk) = t.new_key_pair(42);
        publish(
            &mut t,
            office,
            "js-private",
            1,
            pk.to_byte_type().to_string(),
            String::new(),
            1_000_000,
            1_000_000,
        );
        let component = child(&mut t, office, "js-private");
        let (tx, _) = js_transaction(
            serde_json::json!({"component":component.to_string(),"destination":destination.to_string(),"testSecret":serde_json::to_value(&sk).unwrap(),"inputs":[]}),
        );
        t.enable_fees();
        t.execute_expect_success(tx, vec![]);
        assert!(letter(&mut t, office, "js-private").claimed);
        assert_eq!(balance(&t, destination), Amount::from(1_000_000u64));
    }
    #[test]
    #[ignore = "requires Node and tsx; native account creation in the fee stage"]
    fn javascript_guest_creates_an_unfunded_account_in_the_claim_checkpoint() {
        let (mut t, office, _) = fixture();
        let (_, recipient_pk) = t.new_key_pair(78);
        let component = child(&mut t, office, "gift");
        let (tx, _) = js_transaction(serde_json::json!({
            "component": component.to_string(),
            "newAccountPublicKey": recipient_pk.to_byte_type().to_string(),
            "testSecret": serde_json::to_value(t.secret_key()).unwrap(),
            "inputs": []
        }));
        t.enable_fees();
        t.execute_expect_success(tx, vec![]);
        let e = letter(&mut t, office, "gift");
        assert!(e.claimed);
        assert_eq!(
            balance(&t, e.destination.unwrap().to_string().parse().unwrap()),
            Amount::from(1_000_000u64)
        );
    }
    #[test]
    #[ignore = "requires Node and tsx; creation rollback and private claim authorization"]
    fn javascript_guest_creation_rolls_back_for_bad_authority_and_insufficient_fees() {
        let (mut t, office, _) = fixture();
        let (_, authority) = t.new_key_pair(81);
        for (id, mode, reserve) in [
            ("bad-authority", 1, 1_000_000),
            ("small-creation-reserve", 0, 1),
        ] {
            let (_, recipient_pk) = t.new_key_pair(if mode == 1 { 82 } else { 83 });
            let destination =
                tari_engine_types::component::derive_component_address_from_public_key(
                    // Public built-in Account constant; the template ABI accessor
                    // requires a running WASM context and cannot run on this host.
                    &TemplateAddress::from_array([0; 32]),
                    &recipient_pk.to_byte_type(),
                );
            publish(
                &mut t,
                office,
                id,
                mode,
                if mode == 1 {
                    authority.to_byte_type().to_string()
                } else {
                    String::new()
                },
                String::new(),
                1_000_000,
                reserve,
            );
            let component = child(&mut t, office, id);
            let (tx, _) = js_transaction(serde_json::json!({
                "component": component.to_string(),
                "newAccountPublicKey": recipient_pk.to_byte_type().to_string(),
                "testSecret": serde_json::to_value(t.secret_key()).unwrap(),
                "inputs": []
            }));
            t.enable_fees();
            t.execute_expect_failure(tx, vec![]);
            assert!(!letter(&mut t, office, id).claimed);
            assert_eq!(
                gift_balance(&mut t, office, id),
                Amount::from(1_000_000 + reserve)
            );
            assert!(
                t.read_only_state_store()
                    .get_component(destination)
                    .is_err()
            );
        }
    }
    #[test]
    #[ignore = "requires Node and tsx; full isolated JS crypto -> engine round trip"]
    fn javascript_encrypted_publication_decryption_claim_and_recipient_spend() {
        let (mut t, office, _) = fixture();
        let (destination, recipient_proof, recipient_sk) = t.create_empty_account();
        let (account, proof, sk) = t.create_funded_account();
        let template = t.get_template_address("PostOffice").to_string();
        let (tx, out) = js_transaction(
            serde_json::json!({"operation":"publish","registry":office.to_string(),"template":template,"resource":TARI_TOKEN.to_string(),"account":account.to_string(),"testSecret":serde_json::to_value(&sk).unwrap(),"inputs":[]}),
        );
        t.enable_fees();
        t.execute_expect_success(tx, vec![proof]);
        let e = letter(&mut t, office, "js-roundtrip");
        assert!(!e.payload.contains("Hidden engine letter"));
        assert!(!e.payload.contains(out["capability"].as_str().unwrap()));
        let component = child(&mut t, office, "js-roundtrip");
        let (tx, _) = js_transaction(
            serde_json::json!({"registry":office.to_string(),"template":template,"component":component.to_string(),"destination":destination.to_string(),"capability":out["capability"],"payload":serde_json::from_str::<serde_json::Value>(&e.payload).unwrap(),"inputs":[]}),
        );
        t.enable_fees();
        t.execute_expect_success(tx, vec![]);
        assert_eq!(balance(&t, destination), Amount::from(1_000_000u64));
        // The recipient owns this built-in account; demonstrate a spend using its
        // harness key. This is engine evidence, not wallet/indexer discovery evidence.
        t.disable_fees();
        let (second, _, _) = t.create_empty_account();
        t.execute_expect_success(
            t.transaction()
                .call_method(
                    destination,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(1_000_000u64)],
                )
                .put_last_instruction_output_on_workspace("received")
                .call_method(second, "deposit", args![Workspace("received")])
                .build_and_seal(&recipient_sk),
            vec![recipient_proof],
        );
        assert_eq!(balance(&t, destination), Amount::zero());
        assert_eq!(balance(&t, second), Amount::from(1_000_000u64));
    }
}
