pub mod letter;
pub mod ownership;
use tari_template_lib::prelude::*;
#[template]
pub mod ghostdrop_v3 {
    use super::*;
    use crate::letter::letter::Envelope;
    use std::collections::BTreeMap;
    #[derive(Clone)]
    pub struct GhostDrop {
        network: u8,
        letters: BTreeMap<String, ComponentAddress>,
        postboxes: BTreeMap<String, Postbox>,
        envelope_template: TemplateAddress,
        mailboxes: BTreeMap<String, ComponentAddress>,
        kind: u8,
        envelope: Option<Envelope>,
        mailbox: Option<MailboxState>,
        recovery_resource: Option<ResourceAddress>,
    }
    #[derive(Clone)]
    pub struct Postbox {
        pub id: String,
        pub nickname: String,
        pub controller: RistrettoPublicKeyBytes,
        pub encryption_key: String,
        pub discoverable: bool,
    }
    #[derive(Clone)]
    pub struct MailboxState {
        pub postbox: String,
        pub controller: RistrettoPublicKeyBytes,
        pub revision: u64,
        pub ciphertext: String,
        pub registry: ComponentAddress,
    }
    impl GhostDrop {
        fn blank(network: u8, template: TemplateAddress, kind: u8) -> Self {
            Self {
                network,
                letters: BTreeMap::new(),
                postboxes: BTreeMap::new(),
                envelope_template: template,
                mailboxes: BTreeMap::new(),
                kind,
                envelope: None,
                mailbox: None,
                recovery_resource: None,
            }
        }
        fn office(&self) {
            assert_eq!(self.kind, 0, "Post office only");
        }
        pub fn new(network: u8, template: TemplateAddress) -> Component<Self> {
            assert!([16, 36, 38].contains(&network), "Test networks only");
            let allocation = CallerContext::allocate_component_address(None);
            let resource = ResourceBuilder::stealth()
                .with_owner_rule(OwnerRule::None)
                .mintable(rule!(component(allocation.get_address())), LOCKED)
                .burnable(rule!(deny_all), LOCKED)
                .recallable(rule!(deny_all), LOCKED)
                .freezable(rule!(deny_all), LOCKED)
                .build();
            let mut state = Self::blank(network, template, 0);
            state.recovery_resource = Some(resource);
            let component = Component::new(state)
                .with_address_allocation(allocation)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create();
            assert_eq!(
                ComponentManager::get(*component.address()).get_template_address(),
                template,
                "Wrong unified template"
            );
            component
        }
        pub fn resource(&self) -> ResourceAddress {
            self.office();
            self.recovery_resource.expect("Missing recovery resource")
        }
        pub fn store(&self, statement_json: String) {
            self.office();
            assert!(statement_json.len() <= 16384, "Capsule statement too large");
            let statement: StealthTransferStatement =
                serde_json::from_str(&statement_json).expect("Invalid capsule statement");
            assert!(
                statement.inputs_statement.inputs.is_empty(),
                "No existing inputs"
            );
            assert!(
                statement.inputs_statement.revealed_amount == Amount::from(1u64),
                "One carrier unit"
            );
            assert!(
                statement.outputs_statement.outputs.len() == 1,
                "One carrier output"
            );
            assert!(
                statement.outputs_statement.revealed_output.is_none(),
                "No revealed change"
            );
            match &statement.outputs_statement.outputs[0].auth {
                tari_template_lib::types::stealth::SpendAuthorization::Script(root) => {
                    assert!(
                        root.to_string()
                            == "51fc79d1cad4e2dccb4fd1edaff44dc395b5c290b71a48c731111a776548a788",
                        "Permanent DenyAll root"
                    )
                }
                _ => panic!("No key spend path"),
            }
            ResourceManager::get(self.recovery_resource.expect("Missing recovery resource"))
                .mint_stealth(Amount::from(1u64))
                .stealth_transfer(statement)
                .drop_empty();
        }
        pub fn create_postbox(
            &mut self,
            id: String,
            nickname: String,
            encryption_key: String,
            discoverable: bool,
        ) {
            self.office();
            assert!(
                !id.is_empty() && id.len() <= 64 && !self.postboxes.contains_key(&id),
                "Invalid/duplicate postbox ID"
            );
            assert!(
                !nickname.is_empty() && nickname.len() <= 80,
                "Invalid nickname"
            );
            assert!(
                !encryption_key.is_empty() && encryption_key.len() <= 512,
                "Invalid encryption key"
            );
            assert!(self.postboxes.len() < 512, "Postbox directory full");
            let controller = CallerContext::transaction_signer_public_key();
            self.postboxes.insert(
                id.clone(),
                Postbox {
                    id,
                    nickname,
                    controller,
                    encryption_key,
                    discoverable,
                },
            );
        }
        pub fn edit_postbox(&mut self, id: String, nickname: String, discoverable: bool) {
            self.office();
            assert!(
                !nickname.is_empty() && nickname.len() <= 80,
                "Invalid nickname"
            );
            let p = self.postboxes.get_mut(&id).expect("Unknown postbox");
            let proof = CallerContext::get_signer_proof_for_public_key(p.controller);
            proof.drop();
            p.nickname = nickname;
            p.discoverable = discoverable;
        }
        pub fn rotate_postbox_key(&mut self, id: String, encryption_key: String) {
            self.office();
            assert!(
                !encryption_key.is_empty() && encryption_key.len() <= 512,
                "Invalid encryption key"
            );
            let p = self.postboxes.get_mut(&id).expect("Unknown postbox");
            let proof = CallerContext::get_signer_proof_for_public_key(p.controller);
            proof.drop();
            p.encryption_key = encryption_key;
        }
        pub fn publish(
            &mut self,
            id: String,
            mode: u8,
            payload: String,
            gift: u64,
            reserve: u64,
            authority_hex: String,
            recipient: String,
            reply: String,
            campaign: String,
            funding: Bucket,
        ) {
            self.office();
            assert!(!self.letters.contains_key(&id), "Duplicate envelope ID");
            assert!(self.letters.len() < 4096, "Letter directory full");
            if !reply.is_empty() {
                let p = self.postboxes.get(&reply).expect("Unknown reply postbox");
                let proof = CallerContext::get_signer_proof_for_public_key(p.controller);
                proof.drop();
            }
            if mode == 2 {
                let p = self.postboxes.get(&recipient).expect("Unknown recipient");
                assert_eq!(
                    authority_hex,
                    p.controller.to_string(),
                    "Recipient authority mismatch"
                );
            } else {
                assert!(recipient.is_empty(), "Unexpected recipient");
            }
            let sender = CallerContext::transaction_signer_public_key();
            let mut child = Self::blank(self.network, self.envelope_template, 1);
            child.envelope = Some(Envelope::new(
                self.network,
                id.clone(),
                mode,
                payload,
                gift,
                reserve,
                authority_hex,
                recipient,
                reply,
                sender,
                campaign,
                funding,
                CallerContext::current_component_address(),
            ));
            assert!(
                tari_bor::encode(&child)
                    .expect("Complete letter encoding")
                    .len()
                    <= 32768,
                "Complete envelope exceeds 32 KiB"
            );
            let envelope = *Component::new(child)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create()
                .address();
            self.letters.insert(id, envelope);
        }
        pub fn letter(&self, id: String) -> ComponentAddress {
            self.office();
            *self.letters.get(&id).expect("Unknown envelope")
        }
        pub fn postbox(&self, id: String) -> Postbox {
            self.office();
            self.postboxes.get(&id).expect("Unknown postbox").clone()
        }
        pub fn postbox_controller(&self, id: String) -> RistrettoPublicKeyBytes {
            self.office();
            self.postboxes.get(&id).expect("Unknown postbox").controller
        }
        pub fn list_letters(&self, after: String, limit: u32) -> Vec<(String, ComponentAddress)> {
            self.office();
            assert!(limit > 0 && limit <= 100, "Page size 1..100");
            self.letters
                .iter()
                .filter(|(id, _)| **id > after)
                .take(limit as usize)
                .map(|(id, e)| (id.clone(), *e))
                .collect()
        }
        pub fn list_postboxes(&self, after: String, limit: u32) -> Vec<Postbox> {
            self.office();
            assert!(limit > 0 && limit <= 100, "Page size 1..100");
            self.postboxes
                .iter()
                .filter(|(id, _)| **id > after)
                .take(limit as usize)
                .map(|(_, p)| p.clone())
                .collect()
        }

        pub fn open_mailbox(&mut self, postbox: String, ciphertext: String) -> ComponentAddress {
            self.office();
            assert!(
                !self.mailboxes.contains_key(&postbox),
                "Mailbox already exists"
            );
            assert!(
                !ciphertext.is_empty() && ciphertext.len() <= 98304,
                "Mailbox ciphertext exceeds limit"
            );
            let controller = self.postbox_controller(postbox.clone());
            CallerContext::get_signer_proof_for_public_key(controller).drop();
            let mut child = Self::blank(self.network, self.envelope_template, 2);
            child.mailbox = Some(MailboxState {
                postbox: postbox.clone(),
                controller,
                revision: 1,
                ciphertext,
                registry: CallerContext::current_component_address(),
            });
            let address = *Component::new(child)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create()
                .address();
            self.mailboxes.insert(postbox, address);
            address
        }
        pub fn mailbox_address(&self, postbox: String) -> Option<ComponentAddress> {
            self.office();
            self.mailboxes.get(&postbox).copied()
        }
        pub fn get_mailbox(&self) -> MailboxState {
            assert_eq!(self.kind, 2, "Mailbox only");
            self.mailbox.clone().expect("Missing mailbox")
        }
        pub fn set_ciphertext(&mut self, expected_revision: u64, ciphertext: String) {
            assert_eq!(self.kind, 2, "Mailbox only");
            assert!(
                !ciphertext.is_empty() && ciphertext.len() <= 98304,
                "Mailbox ciphertext exceeds limit"
            );
            let state = self.mailbox.as_mut().expect("Missing mailbox");
            let registry = ComponentManager::get(state.registry);
            assert_eq!(
                registry.get_template_address(),
                self.envelope_template,
                "Wrong post office template"
            );
            let registered: Option<ComponentAddress> =
                registry.call("mailbox_address", args![state.postbox.clone()]);
            assert_eq!(
                registered,
                Some(CallerContext::current_component_address()),
                "Unregistered mailbox"
            );
            let controller: RistrettoPublicKeyBytes =
                registry.call("postbox_controller", args![state.postbox.clone()]);
            assert_eq!(state.controller, controller, "Controller changed");
            CallerContext::get_signer_proof_for_public_key(controller).drop();
            assert_eq!(
                state.revision, expected_revision,
                "Mailbox state changed; reload before saving"
            );
            state.revision = state
                .revision
                .checked_add(1)
                .expect("Mailbox revision overflow");
            state.ciphertext = ciphertext;
        }
        pub fn get(&self) -> Envelope {
            assert_eq!(self.kind, 1, "Letter only");
            self.envelope.clone().expect("Missing letter")
        }
        pub fn gift_balance(&self) -> Amount {
            assert_eq!(self.kind, 1, "Letter only");
            self.envelope
                .as_ref()
                .expect("Missing letter")
                .gift_balance()
        }
        pub fn claim_challenge(&self, destination: ComponentAddress, valid_until: u64) -> String {
            assert_eq!(self.kind, 1, "Letter only");
            self.envelope
                .as_ref()
                .expect("Missing letter")
                .claim_challenge(destination, valid_until)
        }
        pub fn claim_and_pay_fee(&mut self, destination: ComponentAddress, network: u8) {
            assert_eq!(self.kind, 1, "Letter only");
            self.envelope
                .as_mut()
                .expect("Missing letter")
                .claim_and_pay_fee(destination, network)
        }
        pub fn claim_with_wallet_proof_and_pay_fee(
            &mut self,
            destination: ComponentAddress,
            network: u8,
            valid_until: u64,
            wallet_address: String,
            public_nonce: String,
            signature: String,
        ) {
            assert_eq!(self.kind, 1, "Letter only");
            self.envelope
                .as_mut()
                .expect("Missing letter")
                .claim_with_wallet_proof_and_pay_fee(
                    destination,
                    network,
                    valid_until,
                    wallet_address,
                    public_nonce,
                    signature,
                )
        }
    }
}
