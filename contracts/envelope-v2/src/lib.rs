use tari_template_lib::prelude::*;
pub mod ownership;
pub fn validate_letter(
    mode: u8,
    id: &str,
    payload: &str,
    gift: u64,
    reserve: u64,
    authority: bool,
) {
    assert!(mode <= 2, "Unknown mail mode");
    assert!(!id.is_empty() && id.len() <= 64, "Invalid envelope ID");
    assert!(
        !payload.is_empty() && payload.len() + id.len() + 256 <= 4096,
        "Envelope exceeds 4 KiB"
    );
    assert!(
        gift == 0 && reserve == 0 || gift > 0 && reserve > 0,
        "Fund gift and fee reserve together"
    );
    assert!(
        mode == 0 && !authority || mode != 0 && authority,
        "Invalid claim authority"
    );
    gift.checked_add(reserve).expect("Funding overflow");
}
#[template]
pub mod envelope_v2 {
    use super::*;
    #[derive(Clone)]
    pub struct EnvelopeV2 {
        pub network: u8,
        pub id: String,
        pub mode: u8,
        pub payload: String,
        pub gift: u64,
        pub reserve: u64,
        pub claimed: bool,
        pub authority: Option<RistrettoPublicKeyBytes>,
        pub recipient: String,
        pub reply: String,
        pub sender: RistrettoPublicKeyBytes,
        pub campaign: String,
        vault: Vault,
        pub destination: Option<ComponentAddress>,
        pub registry: ComponentAddress,
    }
    impl EnvelopeV2 {
        pub fn new(
            network: u8,
            id: String,
            mode: u8,
            payload: String,
            gift: u64,
            reserve: u64,
            authority_hex: String,
            recipient: String,
            reply: String,
            sender: RistrettoPublicKeyBytes,
            campaign: String,
            funding: Bucket,
            registry: ComponentAddress,
        ) -> Component<Self> {
            assert!([16, 36, 38].contains(&network), "Test networks only");
            let authority = if authority_hex.is_empty() {
                None
            } else {
                Some(
                    authority_hex
                        .parse::<RistrettoPublicKeyBytes>()
                        .expect("Invalid claim public key"),
                )
            };
            validate_letter(mode, &id, &payload, gift, reserve, authority.is_some());
            // PostOfficeV2 authenticates and freezes this key while holding its
            // write lock. Claim-time registry checks avoid a reentrant callback.
            assert!(
                recipient.len() <= 64 && reply.len() <= 64 && campaign.len() <= 80,
                "Metadata too long"
            );
            assert!(
                mode == 0 || campaign.is_empty(),
                "Faucet campaigns are public only"
            );
            assert_eq!(
                funding.resource_address(),
                TARI_TOKEN,
                "Only test native TARI is supported"
            );
            assert_eq!(
                funding.amount(),
                Amount::from(gift.checked_add(reserve).unwrap()),
                "Exact funding required"
            );
            let e = Self {
                network,
                id,
                mode,
                payload,
                gift,
                reserve,
                claimed: false,
                authority,
                recipient,
                reply,
                sender,
                campaign,
                vault: Vault::from_bucket(funding),
                destination: None,
                registry,
            };
            assert!(
                tari_bor::encode(&e).expect("Envelope serialization").len() <= 4096,
                "Complete envelope exceeds 4 KiB"
            );
            Component::new(e)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create()
        }
        // Run wholly in fee_instructions: deposit + claimed state + fee payment
        // share the checkpoint. Later main failure cannot restore claimability.
        pub fn claim_and_pay_fee(&mut self, destination: ComponentAddress, network: u8) {
            assert_eq!(network, self.network, "Wrong network");
            assert!(!self.claimed && self.gift > 0, "No claimable gift");
            if let Some(pk) = self.authority {
                let proof = CallerContext::get_signer_proof_for_public_key(pk);
                proof.drop();
            }
            let account = ComponentManager::get(destination);
            assert_eq!(
                account.get_template_address(),
                BuiltinTemplate::Account.address(),
                "Destination must be a built-in account"
            );
            self.claimed = true;
            self.destination = Some(destination);
            account.invoke("deposit", args![self.vault.withdraw(self.gift)]);
            self.vault.pay_fee(self.reserve);
        }
        pub fn get(&self) -> EnvelopeV2 {
            self.clone()
        }
        pub fn claim_challenge(&self, destination: ComponentAddress, valid_until: u64) -> String {
            let challenge = serde_json::to_string(&(
                "gd-postbox-claim-1",
                self.network,
                self.registry.to_string(),
                CallerContext::current_component_address().to_string(),
                destination.to_string(),
                TARI_TOKEN.to_string(),
                self.gift.to_string(),
                self.reserve.to_string(),
                valid_until,
            ))
            .expect("Claim context encoding");
            assert!(challenge.len() <= 500, "Claim context too large");
            challenge
        }
        // All validation precedes payout/fee payment. These changes share the fee checkpoint.
        pub fn claim_with_wallet_proof_and_pay_fee(
            &mut self,
            destination: ComponentAddress,
            network: u8,
            valid_until: u64,
            wallet_address: String,
            public_nonce: String,
            signature: String,
        ) {
            assert_eq!(network, self.network, "Wrong network");
            assert!(
                self.mode == 2 && !self.claimed && self.gift > 0,
                "No claimable postbox gift"
            );
            let epoch = Consensus::current_epoch();
            assert!(
                valid_until >= epoch
                    && valid_until <= epoch.checked_add(10).expect("Epoch overflow"),
                "Invalid claim expiry"
            );
            let registry = ComponentManager::get(self.registry);
            let registered: ComponentAddress = registry.call("letter", args![self.id.clone()]);
            assert_eq!(
                registered,
                CallerContext::current_component_address(),
                "Unregistered envelope"
            );
            let controller: RistrettoPublicKeyBytes =
                registry.call("postbox_controller", args![self.recipient.clone()]);
            assert_eq!(
                self.authority,
                Some(controller),
                "Recipient authority mismatch"
            );
            assert!(
                ownership::canonical_hex(&public_nonce) && ownership::canonical_hex(&signature),
                "Invalid proof encoding"
            );
            let nonce = public_nonce.parse().expect("Invalid proof nonce");
            let scalar = ownership::scalar_hex(&signature);
            let challenge = self.claim_challenge(destination, valid_until);
            assert!(
                ownership::verify(
                    network,
                    &wallet_address,
                    &challenge,
                    controller,
                    nonce,
                    scalar
                ),
                "Invalid wallet ownership proof"
            );
            let account = ComponentManager::get(destination);
            assert_eq!(
                account.get_template_address(),
                BuiltinTemplate::Account.address(),
                "Destination must be a built-in account"
            );
            self.claimed = true;
            self.destination = Some(destination);
            account.invoke("deposit", args![self.vault.withdraw(self.gift)]);
            self.vault.pay_fee(self.reserve);
        }
        pub fn gift_balance(&self) -> Amount {
            self.vault.balance()
        }
    }
}
#[cfg(test)]
mod tests {
    use super::validate_letter;
    #[test]
    fn three_authorities_and_text_only() {
        validate_letter(0, "id", "public", 100, 5, false);
        validate_letter(1, "id", "ciphertext", 100, 5, true);
        validate_letter(2, "id", "ciphertext", 0, 0, true);
    }
    #[test]
    #[should_panic]
    fn missing_fee_reserve() {
        validate_letter(0, "id", "x", 100, 0, false);
    }
    #[test]
    #[should_panic]
    fn private_without_authority() {
        validate_letter(1, "id", "x", 100, 1, false);
    }
    #[test]
    #[should_panic]
    fn public_with_secret_authority() {
        validate_letter(0, "id", "x", 100, 1, true);
    }
    #[test]
    #[should_panic]
    fn oversized_complete_envelope() {
        validate_letter(0, "id", &"x".repeat(3900), 0, 0, false);
    }
    #[test]
    #[should_panic]
    fn funding_overflow() {
        validate_letter(0, "id", "x", u64::MAX, 1, false);
    }
}
