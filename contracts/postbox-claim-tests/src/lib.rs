#[cfg(test)]
mod tests {
    use bech32::{Bech32m, Hrp};
    use blake2::{Blake2b, Digest, digest::consts::U64};
    use ghostdrop_envelope_v2::envelope_v2::EnvelopeV2;
    use tari_template_lib::prelude::*;
    use tari_template_test_tooling::{
        TemplateTest,
        byte_type::ToByteType,
        crypto::{RistrettoSchnorr, RistrettoSecretKey},
        transaction::{Transaction, args},
    };
    struct Fixture {
        t: TemplateTest,
        office: ComponentAddress,
        envelope: ComponentAddress,
        destination: ComponentAddress,
        destination_key: RistrettoSecretKey,
        destination_proof: NonFungibleAddress,
    }
    fn fixture(reserve: u64) -> Fixture {
        fixture_mode(reserve, 2)
    }
    fn fixture_mode(reserve: u64, mode: u8) -> Fixture {
        let mut t = TemplateTest::new(
            env!("CARGO_MANIFEST_DIR"),
            ["../ghostdrop-v2", "../envelope-v2"],
        );
        t.disable_fees();
        let child = t.get_template_address("EnvelopeV2");
        let office = t.call_function("PostOfficeV2", "new", args![16u8, child], vec![]);
        t.call_method::<()>(
            office,
            "create_postbox",
            args![
                "box".to_string(),
                "Inbox".to_string(),
                "public-encryption-key".to_string(),
                true
            ],
            vec![],
        );
        let controller = t.to_public_key_bytes().to_string();
        let (sender, proof, sk) = t.create_funded_account();
        t.execute_expect_success(
            t.transaction()
                .call_method(
                    sender,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(1_000_000 + reserve)],
                )
                .put_last_instruction_output_on_workspace("funding")
                .call_method(
                    office,
                    "publish",
                    args![
                        "gift".to_string(),
                        mode,
                        "sealed ciphertext".to_string(),
                        1_000_000u64,
                        reserve,
                        if mode == 0 { String::new() } else { controller },
                        if mode == 2 {
                            "box".to_string()
                        } else {
                            String::new()
                        },
                        String::new(),
                        String::new(),
                        Workspace("funding")
                    ],
                )
                .build_and_seal(&sk),
            vec![proof],
        );
        let envelope = t.call_method(office, "letter", args!["gift".to_string()], vec![]);
        let (destination, destination_proof, destination_key) = t.create_empty_account();
        Fixture {
            t,
            office,
            envelope,
            destination,
            destination_key,
            destination_proof,
        }
    }
    fn address(key: &RistrettoSecretKey, hrp: &str, memo: bool) -> String {
        use tari_template_test_tooling::crypto::PublicKey;
        let owner = tari_template_test_tooling::crypto::RistrettoPublicKey::from_secret_key(key)
            .to_byte_type();
        let mut data = owner.as_bytes().to_vec();
        data.extend_from_slice(owner.as_bytes());
        if memo {
            data.push(1)
        }
        bech32::encode::<Bech32m>(Hrp::parse(hrp).unwrap(), &data).unwrap()
    }
    fn hash_message(network: u8, address: &str, challenge: &str) -> [u8; 64] {
        let tag = b"com.tari.paylink.wallet_ownership_proof.v1.v1";
        let mut h = Blake2b::<U64>::new();
        h.update((tag.len() as u64).to_le_bytes());
        h.update(tag);
        for p in [&[network][..], address.as_bytes(), challenge.as_bytes()] {
            h.update((p.len() as u64).to_le_bytes());
            h.update(p);
        }
        h.finalize().into()
    }
    fn proof(
        f: &mut Fixture,
        destination: ComponentAddress,
        expiry: u64,
        foreign: bool,
        hrp: &str,
        memo: bool,
    ) -> (String, String, String) {
        f.t.disable_fees();
        let challenge: String = f.t.call_method(
            f.envelope,
            "claim_challenge",
            args![destination, expiry],
            vec![],
        );
        let key = if foreign {
            f.t.new_key_pair(77).0
        } else {
            f.t.secret_key().clone()
        };
        let wallet = address(&key, hrp, memo);
        let sig = RistrettoSchnorr::sign_with_nonce_and_message(
            &key,
            f.t.new_key_pair(78).0,
            hash_message(16, &wallet, &challenge),
        )
        .unwrap();
        (
            wallet,
            sig.to_byte_type().public_nonce().to_string(),
            sig.to_byte_type().signature().to_string(),
        )
    }
    fn transaction(
        f: &mut Fixture,
        destination: ComponentAddress,
        network: u8,
        expiry: u64,
        p: (String, String, String),
        fail_main: bool,
    ) -> Transaction {
        f.t.enable_fees();
        // Seal with an unrelated ephemeral relay: financial wallet signing is not required.
        let relay = f.t.new_key_pair(99).0;
        let mut tx = f.t.transaction().with_fee_instructions_builder(|b| {
            b.call_method(
                f.envelope,
                "claim_with_wallet_proof_and_pay_fee",
                args![destination, network, expiry, p.0, p.1, p.2],
            )
        });
        if fail_main {
            tx = tx.call_method(f.envelope, "missing_method", args![])
        }
        tx.build_and_seal(&relay)
    }
    fn state(f: &mut Fixture) -> EnvelopeV2 {
        f.t.disable_fees();
        f.t.execute_expect_success(
            f.t.transaction()
                .call_method(f.envelope, "get", args![])
                .build_and_seal(f.t.secret_key()),
            vec![],
        );
        // Test-only capture; production confirmation uses committed state/receipts.
        f.t.expect_return(0)
    }
    fn balance(f: &Fixture, d: ComponentAddress) -> Amount {
        f.t.read_only_state_store()
            .get_vaults_for_account(d)
            .unwrap()
            .get(&TARI_TOKEN)
            .map(|v| v.balance())
            .unwrap_or(Amount::zero())
    }
    fn funds(f: &mut Fixture) -> Amount {
        f.t.disable_fees();
        f.t.call_method(f.envelope, "gift_balance", args![], vec![])
    }
    #[test]
    fn v2_guest_account_creation_is_paid_entirely_from_the_gift_reserve() {
        let mut f = fixture_mode(100_000, 0);
        let (_, owner) = f.t.new_key_pair(95);
        let relay = f.t.new_key_pair(96).0;
        f.t.enable_fees();
        let tx =
            f.t.transaction()
                .with_fee_instructions_builder(|b| {
                    b.create_account(owner.to_byte_type())
                        .put_last_instruction_output_on_workspace("receiving_account")
                        .call_method(
                            f.envelope,
                            "claim_and_pay_fee",
                            args![Workspace("receiving_account"), 16u8],
                        )
                })
                .build_and_seal(&relay);
        let result = f.t.execute_expect_success(tx, vec![]);
        assert!(result.finalize.total_fees_required <= 100_000);
        let claimed = state(&mut f);
        assert!(claimed.claimed);
        assert_eq!(
            balance(&f, claimed.destination.unwrap()),
            Amount::from(1_000_000u64)
        );
    }
    #[test]
    fn v2_public_and_private_link_guests_preserve_full_payout_and_authority() {
        for mode in [0u8, 1u8] {
            let mut f = fixture_mode(100_000, mode);
            let d = f.destination;
            f.t.enable_fees();
            let relay = f.t.new_key_pair(97).0;
            if mode == 1 {
                let wrong =
                    f.t.transaction()
                        .with_fee_instructions_builder(|b| {
                            b.call_method(f.envelope, "claim_and_pay_fee", args![d, 16u8])
                        })
                        .build_and_seal(&relay);
                f.t.execute_expect_failure(wrong, vec![]);
                assert!(!state(&mut f).claimed);
                assert_eq!(balance(&f, d), Amount::zero());
                f.t.enable_fees();
            }
            let key = if mode == 0 { &relay } else { f.t.secret_key() };
            let tx =
                f.t.transaction()
                    .with_fee_instructions_builder(|b| {
                        b.call_method(f.envelope, "claim_and_pay_fee", args![d, 16u8])
                    })
                    .build_and_seal(key);
            let replay = tx.clone();
            let result = f.t.execute_expect_success(tx, vec![]);
            assert!(result.finalize.total_fees_required <= 100_000);
            assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
            assert!(state(&mut f).claimed);
            f.t.enable_fees();
            f.t.execute_expect_failure(replay, vec![]);
            assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
        }
    }
    #[test]
    fn proof_delivers_to_empty_account_once_and_is_independently_spendable() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        assert_eq!(balance(&f, d), Amount::zero());
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p.clone(), false);
        let r = f.t.execute_expect_success(tx, vec![]);
        assert!(r.finalize.total_fees_required > 0);
        assert!(state(&mut f).claimed);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
        f.t.disable_fees();
        let (recipient, _, _) = f.t.create_empty_account();
        f.t.enable_fees();
        let spend =
            f.t.transaction()
                .with_fee_instructions_builder(|b| {
                    b.call_method(d, "pay_fee", args![Amount::from(100_000u64)])
                })
                .call_method(d, "withdraw", args![TARI_TOKEN, Amount::from(500_000u64)])
                .put_last_instruction_output_on_workspace("payment")
                .call_method(recipient, "deposit", args![Workspace("payment")])
                .build_and_seal(&f.destination_key);
        f.t.execute_expect_success(spend, vec![f.destination_proof.clone()]);
        assert_eq!(balance(&f, recipient), Amount::from(500_000u64));
        assert!(balance(&f, d) < Amount::from(500_000u64));
    }
    #[test]
    fn wrong_proofs_and_destinations_cannot_drain_reserve() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        let original = funds(&mut f);
        let (other, _, _) = f.t.create_empty_account();
        for case in 0..11 {
            let mut p = proof(
                &mut f,
                d,
                5,
                case == 0,
                if case == 1 { "otl_esm_" } else { "otl_loc_" },
                case == 2,
            );
            if case == 3 {
                p.2 = "ff".repeat(32)
            }
            if case == 4 {
                p.1 = "00".repeat(32)
            }
            if case == 7 {
                p.0 = p.0.to_uppercase()
            }
            if case == 8 {
                p.1 = "ff".repeat(32)
            }
            if case == 9 {
                p.2 = p.2.to_uppercase()
            }
            if case == 10 {
                p.0.replace_range(9..10, "!");
            }
            let target = if case == 5 { other } else { d };
            let network = if case == 6 { 38 } else { 16 };
            let tx = transaction(&mut f, target, network, 5, p, false);
            f.t.execute_expect_failure(tx, vec![]);
            assert_eq!(funds(&mut f), original);
            assert!(!state(&mut f).claimed);
            assert_eq!(balance(&f, d), Amount::zero());
        }
    }
    #[test]
    fn expiry_window_and_stale_proofs_fail_without_fee_drain() {
        use tari_engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId};
        let mut f = fixture(1_000_000);
        let d = f.destination;
        let original = funds(&mut f);
        let p = proof(&mut f, d, 11, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 11, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        let p = proof(&mut f, d, 1, false, "otl_loc_", false);
        f.t.set_virtual_substate(
            VirtualSubstateId::CurrentEpoch,
            VirtualSubstate::CurrentEpoch(2),
        );
        let tx = transaction(&mut f, d, 16, 1, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert_eq!(funds(&mut f), original);
        assert!(!state(&mut f).claimed);
    }
    #[test]
    fn insufficient_fee_rolls_back_gift_and_claimed_state() {
        let mut f = fixture(1);
        let d = f.destination;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert!(!state(&mut f).claimed);
        assert_eq!(funds(&mut f), Amount::from(1_000_001u64));
        assert_eq!(balance(&f, d), Amount::zero());
    }
    #[test]
    fn main_failure_keeps_fee_checkpoint_payout_and_prevents_replay() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p.clone(), true);
        let r = f.t.execute_and_commit_on_success(tx, vec![]);
        r.expect_failure();
        r.expect_finalization_success();
        assert!(state(&mut f).claimed);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_failure(tx, vec![]);
    }
    #[test]
    fn frozen_controller_survives_encryption_key_rotation() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        f.t.call_method::<()>(
            f.office,
            "rotate_postbox_key",
            args!["box".to_string(), "next-public-encryption-key".to_string()],
            vec![],
        );
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_success(tx, vec![]);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
    }
    #[test]
    fn factory_rejects_foreign_controller_without_withdrawing_funding() {
        let mut f = fixture(1_000_000);
        let (sender, proof, sk) = f.t.create_funded_account();
        let original = balance(&f, sender);
        let foreign = f.t.new_key_pair(82).1.to_byte_type().to_string();
        let tx =
            f.t.transaction()
                .call_method(
                    sender,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(2_000_000u64)],
                )
                .put_last_instruction_output_on_workspace("funding")
                .call_method(
                    f.office,
                    "publish",
                    args![
                        "forged".to_string(),
                        2u8,
                        "ciphertext".to_string(),
                        1_000_000u64,
                        1_000_000u64,
                        foreign,
                        "box".to_string(),
                        String::new(),
                        String::new(),
                        Workspace("funding")
                    ],
                )
                .build_and_seal(&sk);
        f.t.execute_expect_failure(tx, vec![proof]);
        assert_eq!(balance(&f, sender), original);
        let ids: Vec<(String, ComponentAddress)> = f.t.call_method(
            f.office,
            "list_letters",
            args![String::new(), 100u32],
            vec![],
        );
        assert_eq!(ids.len(), 1);
    }
    fn publish_second(
        f: &mut Fixture,
        id: &str,
        gift: u64,
        reserve: u64,
        registered: bool,
    ) -> ComponentAddress {
        f.t.disable_fees();
        let (sender, proof, sk) = f.t.create_funded_account();
        let controller = f.t.to_public_key_bytes().to_string();
        let tx =
            f.t.transaction()
                .call_method(
                    sender,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(gift + reserve)],
                )
                .put_last_instruction_output_on_workspace("funding");
        if registered {
            f.t.execute_expect_success(
                tx.call_method(
                    f.office,
                    "publish",
                    args![
                        id.to_string(),
                        2u8,
                        "ciphertext".to_string(),
                        gift,
                        reserve,
                        controller,
                        "box".to_string(),
                        String::new(),
                        String::new(),
                        Workspace("funding")
                    ],
                )
                .build_and_seal(&sk),
                vec![proof],
            );
            f.t.call_method(f.office, "letter", args![id.to_string()], vec![])
        } else {
            f.t.execute_expect_success(
                tx.call_function(
                    f.t.get_template_address("EnvelopeV2"),
                    "new",
                    args![
                        16u8,
                        id.to_string(),
                        2u8,
                        "ciphertext".to_string(),
                        gift,
                        reserve,
                        controller,
                        "box".to_string(),
                        String::new(),
                        f.t.to_public_key_bytes(),
                        String::new(),
                        Workspace("funding"),
                        f.office
                    ],
                )
                .build_and_seal(&sk),
                vec![proof],
            );
            f.t.expect_return(f.t.return_values().len() - 1)
        }
    }
    #[test]
    fn proof_is_bound_to_envelope_amount_reserve_and_expiry() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        let original_envelope = f.envelope;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        for (id, gift, reserve) in [
            ("other", 1_000_000, 1_000_000),
            ("other-value", 999_999, 1_000_000),
            ("other-reserve", 1_000_000, 999_999),
        ] {
            f.envelope = publish_second(&mut f, id, gift, reserve, true);
            let before = funds(&mut f);
            let tx = transaction(&mut f, d, 16, 5, p.clone(), false);
            f.t.execute_expect_failure(tx, vec![]);
            assert!(!state(&mut f).claimed);
            assert_eq!(funds(&mut f), before);
        }
        f.envelope = original_envelope;
        let tx = transaction(&mut f, d, 16, 6, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert!(!state(&mut f).claimed);
        assert_eq!(balance(&f, d), Amount::zero());
    }
    #[test]
    fn direct_unregistered_envelope_cannot_claim_even_with_its_valid_owner_proof() {
        let mut f = fixture(1_000_000);
        let d = f.destination;
        f.envelope = publish_second(&mut f, "gift", 1_000_000, 1_000_000, false);
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert!(!state(&mut f).claimed);
        assert_eq!(funds(&mut f), Amount::from(2_000_000u64));
    }
    #[test]
    fn approved_non_account_destination_is_rejected_before_payout() {
        let mut f = fixture(1_000_000);
        let d = f.office;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p, false);
        f.t.execute_expect_failure(tx, vec![]);
        assert!(!state(&mut f).claimed);
        assert_eq!(funds(&mut f), Amount::from(2_000_000u64));
    }
    #[test]
    fn one_hundred_thousand_reserve_covers_measured_engine_claim_fee() {
        let mut f = fixture(100_000);
        let d = f.destination;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let tx = transaction(&mut f, d, 16, 5, p, false);
        let result = f.t.execute_expect_success(tx, vec![]);
        println!(
            "Proof claim fee required: {} microTARI; reserve: 100000",
            result.finalize.total_fees_required
        );
        assert!(result.finalize.total_fees_required <= 100_000);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
    }
    #[test]
    #[ignore = "requires Node/tsx; production JS builder and WASM sealing bridge"]
    fn javascript_proof_claim_executes_with_exact_context_bor_and_ephemeral_seal() {
        use std::{
            io::Write,
            process::{Command, Stdio},
        };
        let mut f = fixture(100_000);
        let d = f.destination;
        let p = proof(&mut f, d, 5, false, "otl_loc_", false);
        let expected: String =
            f.t.call_method(f.envelope, "claim_challenge", args![d, 5u64], vec![]);
        let input = serde_json::json!({
            "envelope":{"claimProtocol":"sapient-proof-1","component":f.envelope.to_string(),"id":"gift","mode":"postbox","context":{"network":16,"registry":f.office.to_string(),"template":f.t.get_template_address("PostOfficeV2").to_string()},"payload":{"subject":"fixture","body":"unused"},"gift":"1000000","reserve":"100000","claimed":false,"sender":"","claimAuthority":f.t.to_public_key_bytes().to_string()},
            "destination":d.to_string(),"expiry":5,"expectedChallenge":expected,
            "proof":{"walletAddress":p.0,"publicNonce":p.1,"signature":p.2},"inputs":[]
        });
        let node = std::env::var("GHOSTDROP_TEST_NODE").unwrap_or("node".into());
        let loader = std::env::var("GHOSTDROP_TEST_LOADER").unwrap_or("tsx".into());
        let script = std::env::var("GHOSTDROP_TEST_POSTBOX_SIGNER").unwrap_or_else(|_| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../tools/sign-postbox-engine-claim.ts")
                .to_string_lossy()
                .into_owned()
        });
        let mut process = Command::new(node)
            .args(["--experimental-wasm-modules", "--import", &loader, &script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        process
            .stdin
            .take()
            .unwrap()
            .write_all(serde_json::to_string(&input).unwrap().as_bytes())
            .unwrap();
        let result = process.wait_with_output().unwrap();
        assert!(
            result.status.success(),
            "SDK bridge failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        let output: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
        assert_eq!(output["challenge"], input["expectedChallenge"]);
        let tx: Transaction = serde_json::from_value(output["json"].clone()).unwrap();
        let hex = output["bor"].as_str().unwrap();
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        let decoded: Transaction = tari_bor::decode(&bytes).unwrap();
        assert_eq!(decoded.calculate_id(), tx.calculate_id());
        assert!(tx.verify_all_signatures());
        assert_ne!(tx.main_signer(), Some(f.t.to_public_key_bytes()));
        f.t.enable_fees();
        f.t.execute_expect_success(decoded, vec![]);
        assert!(state(&mut f).claimed);
        assert_eq!(balance(&f, d), Amount::from(1_000_000u64));
    }
}

#[cfg(test)]
mod mailbox_state;

#[cfg(test)]
mod unified_claims;

#[cfg(test)]
mod unified_capsules;

#[cfg(test)]
mod persistent_optional;

#[cfg(test)]
mod sealed_delivery;
