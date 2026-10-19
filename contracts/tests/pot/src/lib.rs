#[cfg(test)]
mod tests {
    use tari_engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId};
    use tari_template_lib::prelude::*;
    use tari_template_test_tooling::{TemplateTest, crypto::RistrettoSecretKey, transaction::args};
    struct F {
        t: TemplateTest,
        office: ComponentAddress,
        catalog: ComponentAddress,
        round: ComponentAddress,
        alice: ComponentAddress,
        proof: NonFungibleAddress,
        key: RistrettoSecretKey,
    }
    fn epoch(t: &mut TemplateTest, epoch: u64, seed: u8) {
        t.set_virtual_substate(
            VirtualSubstateId::CurrentEpoch,
            VirtualSubstate::CurrentEpoch(epoch),
        );
        t.set_virtual_substate(
            VirtualSubstateId::CurrentEpochHash,
            VirtualSubstate::CurrentEpochHash([seed; 32].into()),
        );
    }
    fn fixture() -> F {
        let mut t = TemplateTest::new(
            env!("CARGO_MANIFEST_DIR"),
            ["../../moonmail-v4", "../../moonmail-pot"],
        );
        t.disable_fees();
        epoch(&mut t, 0, 1);
        let office = t.call_function(
            "MoonMail",
            "new",
            args![16u8, t.get_template_address("MoonMail")],
            vec![],
        );
        let resource: ResourceAddress = t.call_method(office, "resource", args![], vec![]);
        let (alice, proof, key) = t.create_funded_account();
        let descriptor = serde_json::json!({"version":"gd-postbox-1","keyVersion":1,"publicKey":"12".repeat(32),"recovery":"sapient-capsule-1","capsule":{"resource":resource.to_string(),"commitment":"34".repeat(32)}}).to_string();
        for id in ["alice", "alice-second"] {
            t.execute_expect_success(
                t.transaction()
                    .call_method(
                        office,
                        "create_postbox",
                        args![id.to_string(), id.to_string(), descriptor.clone(), true],
                    )
                    .build_and_seal(&key),
                vec![proof.clone()],
            );
        }
        let catalog = t.call_function(
            "MoonPot",
            "new",
            args![16u8, office, t.get_template_address("MoonMail")],
            vec![],
        );
        let round = t.call_method(catalog, "open_round", args![], vec![]);
        F {
            t,
            office,
            catalog,
            round,
            alice,
            proof,
            key,
        }
    }
    fn contribute(f: &mut F, id: &str, amount: u64, message: &str, succeeds: bool) {
        let tx =
            f.t.transaction()
                .call_method(f.alice, "withdraw", args![TARI_TOKEN, Amount::from(amount)])
                .put_last_instruction_output_on_workspace("entry")
                .call_method(
                    f.round,
                    "contribute",
                    args![id.to_string(), message.to_string(), Workspace("entry")],
                )
                .build_and_seal(&f.key);
        if succeeds {
            f.t.execute_expect_success(tx, vec![f.proof.clone()]);
        } else {
            f.t.execute_expect_failure(tx, vec![f.proof.clone()]);
        }
    }
    fn balance(f: &mut F) -> Amount {
        f.t.call_method(f.round, "balance", args![], vec![])
    }
    #[test]
    fn contributions_are_authenticated_atomic_and_aggregate_by_postbox() {
        let mut f = fixture();
        contribute(&mut f, "alice", 100_000, "First moonlit wish", true);
        contribute(&mut f, "alice", 200_000, "Another wish", true);
        contribute(&mut f, "alice-second", 700_000, "A second postbox", true);
        assert_eq!(balance(&mut f), Amount::from(1_000_000u64));
        assert_eq!(f.t.extract_component_value::<u64>(f.round, "9"), 1_000_000);
        contribute(&mut f, "missing", 100_000, "Not a registered box", false);
        contribute(&mut f, "alice", 99_999, "Below minimum", false);
        contribute(&mut f, "alice", 100_000, " ", false);
        contribute(&mut f, "alice", 100_000, &"x".repeat(513), false);
        assert_eq!(balance(&mut f), Amount::from(1_000_000u64));
        let (attacker_account, attacker_proof, attacker) = f.t.create_funded_account();
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(
                    attacker_account,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(100_000u64)],
                )
                .put_last_instruction_output_on_workspace("entry")
                .call_method(
                    f.round,
                    "contribute",
                    args![
                        "alice".to_string(),
                        "Forged entry".to_string(),
                        Workspace("entry")
                    ],
                )
                .build_and_seal(&attacker),
            vec![attacker_proof],
        );
    }
    #[test]
    fn fixed_draw_pays_full_pot_once_to_authenticated_winner() {
        let mut f = fixture();
        contribute(&mut f, "alice", 100_000, "First participant", true);
        contribute(&mut f, "alice-second", 300_000, "Second participant", true);
        epoch(&mut f.t, 498, 2);
        contribute(&mut f, "alice", 100_000, "Too late", false);
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "draw", args![])
                .build_and_seal(f.t.secret_key()),
            vec![],
        );
        epoch(&mut f.t, 504, 9);
        f.t.call_method::<()>(f.round, "draw", args![], vec![]);
        let winner = f.t.extract_component_value::<String>(f.round, "10");
        assert!(["alice", "alice-second"].contains(&winner.as_str()));
        let (dest, _, _) = f.t.create_empty_account();
        let attacker = f.t.new_key_pair(92).0;
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "claim", args![dest])
                .build_and_seal(&attacker),
            vec![],
        );
        f.t.execute_expect_success(
            f.t.transaction()
                .call_method(f.round, "claim", args![dest])
                .build_and_seal(&f.key),
            vec![f.proof.clone()],
        );
        assert_eq!(balance(&mut f), Amount::zero());
        assert_eq!(
            f.t.read_only_state_store()
                .get_vaults_for_account(dest)
                .unwrap()
                .get(&TARI_TOKEN)
                .unwrap()
                .balance(),
            Amount::from(400_000u64)
        );
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "claim", args![dest])
                .build_and_seal(&f.key),
            vec![f.proof.clone()],
        );
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "refund", args!["alice".to_string(), dest])
                .build_and_seal(&f.key),
            vec![f.proof.clone()],
        );
    }
    #[test]
    fn missed_draw_refunds_each_postbox_once_and_cannot_select_later_seed() {
        let mut f = fixture();
        contribute(
            &mut f,
            "alice",
            100_000,
            "Refund me if the draw is missed",
            true,
        );
        contribute(
            &mut f,
            "alice-second",
            300_000,
            "Independent contribution",
            true,
        );
        let (dest, _, _) = f.t.create_empty_account();
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "refund", args!["alice".to_string(), dest])
                .build_and_seal(&f.key),
            vec![f.proof.clone()],
        );
        epoch(&mut f.t, 505, 10);
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.round, "draw", args![])
                .build_and_seal(f.t.secret_key()),
            vec![],
        );
        for id in ["alice", "alice-second"] {
            f.t.execute_expect_success(
                f.t.transaction()
                    .call_method(f.round, "refund", args![id.to_string(), dest])
                    .build_and_seal(&f.key),
                vec![f.proof.clone()],
            );
            f.t.execute_expect_failure(
                f.t.transaction()
                    .call_method(f.round, "refund", args![id.to_string(), dest])
                    .build_and_seal(&f.key),
                vec![f.proof.clone()],
            );
        }
        assert_eq!(balance(&mut f), Amount::zero());
        assert_eq!(
            f.t.read_only_state_store()
                .get_vaults_for_account(dest)
                .unwrap()
                .get(&TARI_TOKEN)
                .unwrap()
                .balance(),
            Amount::from(400_000u64)
        );
    }
    #[test]
    fn weekly_catalog_does_not_recreate_active_round_and_is_bound_to_office() {
        let mut f = fixture();
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_method(f.catalog, "open_round", args![])
                .build_and_seal(f.t.secret_key()),
            vec![],
        );
        epoch(&mut f.t, 504, 9);
        let second: ComponentAddress = f.t.call_method(f.catalog, "open_round", args![], vec![]);
        assert_ne!(second, f.round);
        let rounds: Vec<(u64, ComponentAddress)> =
            f.t.call_method(f.catalog, "list_rounds", args![0u64, 10u32], vec![]);
        assert_eq!(rounds, vec![(504, second), (0, f.round)]);
        f.t.execute_expect_failure(
            f.t.transaction()
                .call_function(
                    f.t.get_template_address("MoonPot"),
                    "new",
                    args![0u8, f.office, f.t.get_template_address("MoonMail")],
                )
                .build_and_seal(f.t.secret_key()),
            vec![],
        );
    }
}
