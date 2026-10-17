#[cfg(test)]
mod tests {
    use tari_template_lib::prelude::*;
    use tari_template_lib::types::stealth::{
        MerkleProof, SpendAuthorization, SpendCondition, SpendWitness, StealthInput,
    };
    use tari_template_test_tooling::{TemplateTest, transaction::args};
    #[test]
    fn sdk_capsule_mints_locked_output_and_rejects_unsafe_statements() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.join("../../..");
        let mut t = TemplateTest::new(manifest, ["../../legacy/recovery-capsule"]);
        t.disable_fees();
        let capsule: ComponentAddress = t.call_function("RecoveryCapsules", "new", args![], vec![]);
        let resource: ResourceAddress = t.call_method(capsule, "resource", args![], vec![]);
        let node = std::env::var("GHOSTDROP_TEST_NODE").unwrap_or("node".into());
        let loader = std::env::var("GHOSTDROP_TEST_LOADER").unwrap_or("tsx".into());
        let script = std::env::var("GHOSTDROP_CAPSULE_FIXTURE").unwrap_or_else(|_| {
            repo.join("tools/capsule-engine-fixture.ts")
                .to_string_lossy()
                .into_owned()
        });
        let mut command = std::process::Command::new(node);
        command
            .args(["--import", &loader, &script, &resource.to_string()])
            .current_dir(&repo);
        if let Ok(address) = std::env::var("CAPSULE_PUBLIC_ADDRESS") {
            command.arg(address);
        }
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "Fixture failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let generated: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        let statement: StealthTransferStatement =
            serde_json::from_value(generated["statement"].clone()).unwrap();
        let expected = statement.outputs_statement.outputs[0].clone();
        assert!(matches!(expected.auth, SpendAuthorization::Script(_)));
        assert!(expected.auth.spend_key().is_none());
        assert_eq!(
            expected.auth.condition_root().unwrap().to_string(),
            "51fc79d1cad4e2dccb4fd1edaff44dc395b5c290b71a48c731111a776548a788"
        );
        t.call_method::<()>(
            capsule,
            "store",
            args![generated["statement"].to_string()],
            vec![],
        );
        let mut substates = serde_json::Map::new();
        t.read_only_state_store()
            .with_substates(|id, state| {
                if id.to_string().starts_with("utxo_") || id.to_string() == resource.to_string() {
                    substates.insert(id.to_string(), serde_json::to_value(state).unwrap());
                }
            })
            .unwrap();
        assert_eq!(
            substates.keys().filter(|k| k.starts_with("utxo_")).count(),
            1
        );
        let fixture = serde_json::json!({"engine":"0.45.0", "publicTransactions":0,
            "capsule":capsule.to_string(), "resource":resource.to_string(), "generated":generated, "substates":substates});
        if let Ok(path) = std::env::var("CAPSULE_FIXTURE") {
            assert!(
                path.ends_with(".local.json"),
                "Public fixture export must be explicit/local"
            );
            std::fs::write(path, serde_json::to_string_pretty(&fixture).unwrap()).unwrap();
        }
        let mut unsafe_cases = Vec::new();
        let mut keyed = statement.clone();
        keyed.outputs_statement.outputs[0].auth = SpendAuthorization::Key(t.to_public_key_bytes());
        unsafe_cases.push((serde_json::to_string(&keyed).unwrap(), "No key spend path"));
        let mut wrong_value = statement.clone();
        wrong_value.inputs_statement.revealed_amount = Amount::from(2u64);
        unsafe_cases.push((
            serde_json::to_string(&wrong_value).unwrap(),
            "One carrier unit",
        ));
        let mut multiple = statement.clone();
        multiple.outputs_statement.outputs.push(expected.clone());
        unsafe_cases.push((
            serde_json::to_string(&multiple).unwrap(),
            "One carrier output",
        ));
        let mut root = statement.clone();
        root.outputs_statement.outputs[0].auth = SpendAuthorization::Script([0u8; 32].into());
        unsafe_cases.push((
            serde_json::to_string(&root).unwrap(),
            "Permanent DenyAll root",
        ));
        unsafe_cases.push(("x".repeat(16385), "Capsule statement too large"));
        unsafe_cases.push(("{}".into(), "Invalid capsule statement"));
        for (value, message) in unsafe_cases {
            let reason = t.execute_expect_failure(
                t.transaction()
                    .call_method(capsule, "store", args![value])
                    .build_and_seal(t.secret_key()),
                vec![],
            );
            assert!(
                reason.to_string().contains(message),
                "Expected {message}, got {reason}"
            );
        }
        // Exercise both native spend paths. Authorization precedes balance-proof
        // execution, so neither path can consume this permanent carrier.
        for (witness, message) in [
            (SpendWitness::KeyPath, "no spend_key"),
            (
                SpendWitness::script_path(
                    SpendCondition::access_rule(AccessRule::DenyAll),
                    MerkleProof::empty(),
                ),
                "Access Denied",
            ),
        ] {
            let mut spend = statement.clone();
            spend.inputs_statement.revealed_amount = Amount::ZERO;
            spend.inputs_statement.inputs = vec![StealthInput {
                commitment: expected.output.commitment,
                witness,
            }];
            let reason = t.execute_expect_failure(
                t.transaction()
                    .stealth_transfer(resource, spend)
                    .build_and_seal(t.secret_key()),
                vec![],
            );
            assert!(
                reason.to_string().contains(message),
                "Expected {message}, got {reason}"
            );
        }
        let mut count = 0;
        t.read_only_state_store()
            .with_substates(|id, _| {
                if id.to_string().starts_with("utxo_") {
                    count += 1;
                }
            })
            .unwrap();
        assert_eq!(count, 1, "Rejected attempts must not mint a replacement");
    }
}
