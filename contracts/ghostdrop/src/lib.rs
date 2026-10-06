use tari_template_lib::prelude::*;
#[template]
pub mod ghostdrop {
    use super::*;
    use std::collections::BTreeMap;
    pub struct PostOffice {
        network: u8,
        letters: BTreeMap<String, ComponentAddress>,
        postboxes: BTreeMap<String, Postbox>,
        envelope_template: TemplateAddress,
    }
    #[derive(Clone)]
    pub struct Postbox {
        pub id: String,
        pub nickname: String,
        pub controller: RistrettoPublicKeyBytes,
        pub encryption_key: String,
        pub discoverable: bool,
    }
    impl PostOffice {
        pub fn new(network: u8, envelope_template: TemplateAddress) -> Component<Self> {
            assert!([16, 36, 38].contains(&network), "Test networks only");
            Component::new(Self {
                network,
                letters: BTreeMap::new(),
                postboxes: BTreeMap::new(),
                envelope_template,
            })
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }
        pub fn create_postbox(
            &mut self,
            id: String,
            nickname: String,
            encryption_key: String,
            discoverable: bool,
        ) {
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
            assert!(!encryption_key.is_empty() && encryption_key.len() <= 512, "Invalid encryption key");
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
            assert!(!self.letters.contains_key(&id), "Duplicate envelope ID");
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
            let envelope: ComponentAddress = TemplateManager::get(self.envelope_template).call(
                "new",
                args![
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
                    funding
                ],
            );
            self.letters.insert(id, envelope);
        }
        pub fn letter(&self, id: String) -> ComponentAddress {
            *self.letters.get(&id).expect("Unknown envelope")
        }
        pub fn postbox(&self, id: String) -> Postbox {
            self.postboxes.get(&id).expect("Unknown postbox").clone()
        }
        pub fn list_letters(&self, after: String, limit: u32) -> Vec<(String, ComponentAddress)> {
            assert!(limit > 0 && limit <= 100, "Page size 1..100");
            self.letters
                .iter()
                .filter(|(id, _)| **id > after)
                .take(limit as usize)
                .map(|(id, e)| (id.clone(), *e))
                .collect()
        }
        pub fn list_postboxes(&self, after: String, limit: u32) -> Vec<Postbox> {
            assert!(limit > 0 && limit <= 100, "Page size 1..100");
            self.postboxes
                .iter()
                .filter(|(id, _)| **id > after)
                .take(limit as usize)
                .map(|(_, p)| p.clone())
                .collect()
        }
    }
}
