use crate::ownership;
use tari_template_lib::prelude::*;
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
        !payload.is_empty() && payload.len() + id.len() + 256 <= 32768,
        "Envelope exceeds 32 KiB"
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
pub mod letter {
    use super::*;
    #[derive(Clone, tari_bor::Encode, tari_bor::Decode, tari_bor::CborLen)]
    #[cbor(crate = "tari_bor::minicbor")]
    pub struct Envelope {
        #[n(0)]
        pub network: u8,
        #[n(1)]
        pub id: String,
        #[n(2)]
        pub mode: u8,
        #[n(3)]
        pub payload: String,
        #[n(4)]
        pub gift: u64,
        #[n(5)]
        pub reserve: u64,
        #[n(6)]
        pub claimed: bool,
        #[n(7)]
        #[cbor(with = "crate::optional")]
        pub authority: Option<RistrettoPublicKeyBytes>,
        #[n(8)]
        pub recipient: String,
        #[n(9)]
        pub reply: String,
        #[n(10)]
        pub sender: RistrettoPublicKeyBytes,
        #[n(11)]
        pub campaign: String,
        #[n(12)]
        vault: Vault,
        #[n(13)]
        #[cbor(with = "crate::optional")]
        pub destination: Option<ComponentAddress>,
        #[n(14)]
        pub registry: ComponentAddress,
    }
    impl Envelope {
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
        ) -> Self {
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
                tari_bor::encode(&e).expect("Envelope serialization").len() <= 32768,
                "Complete envelope exceeds 32 KiB"
            );
            e
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
        pub fn get(&self) -> Envelope {
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
