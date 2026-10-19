use tari_template_lib::prelude::*;

/// Epoch schedules follow consensus progress, not the browser clock.
pub const ROUND_EPOCHS: u64 = 504;
pub const CLOSED_EPOCHS: u64 = 6;
pub const MAX_ENTRIES: usize = 128;
pub const MAX_POT: u64 = 1_000_000_000;
pub const MIN_ENTRY: u64 = 100_000;

#[template]
pub mod moonmail_pot {
    use super::*;
    use blake2::{Blake2b, Digest, digest::consts::U32};
    use std::collections::BTreeMap;

    #[derive(Clone)]
    pub struct MoonPot {
        network: u8,
        office: ComponentAddress,
        office_template: TemplateAddress,
        // Catalog components and round components share this template.
        kind: u8,
        origin_epoch: u64,
        next_epoch: u64,
        rounds: BTreeMap<u64, ComponentAddress>,
        entries: Vec<Entry>,
        participants: BTreeMap<String, Participant>,
        total: u64,
        winner: String,
        seed: String,
        paid: bool,
        vault: Vault,
    }
    #[derive(Clone)]
    pub struct Entry {
        pub postbox: String,
        pub controller: RistrettoPublicKeyBytes,
        pub amount: u64,
        pub message: String,
    }
    #[derive(Clone)]
    pub struct Participant {
        pub controller: RistrettoPublicKeyBytes,
        pub amount: u64,
        pub refunded: bool,
    }
    impl MoonPot {
        fn empty(
            network: u8,
            office: ComponentAddress,
            template: TemplateAddress,
            kind: u8,
            epoch: u64,
        ) -> Self {
            Self {
                network,
                office,
                office_template: template,
                kind,
                origin_epoch: epoch,
                next_epoch: epoch,
                rounds: BTreeMap::new(),
                entries: Vec::new(),
                participants: BTreeMap::new(),
                total: 0,
                winner: String::new(),
                seed: String::new(),
                paid: false,
                vault: Vault::new_empty(TARI_TOKEN),
            }
        }
        fn check_office(&self) {
            assert_eq!(
                ComponentManager::get(self.office).get_template_address(),
                self.office_template,
                "Wrong post office template"
            );
        }
        fn round(&self) {
            assert_eq!(self.kind, 1, "Round component required");
        }
        pub fn new(
            network: u8,
            office: ComponentAddress,
            office_template: TemplateAddress,
        ) -> Component<Self> {
            assert!([16, 36, 38].contains(&network), "Test networks only");
            let state = Self::empty(
                network,
                office,
                office_template,
                0,
                Consensus::current_epoch(),
            );
            state.check_office();
            Component::new(state)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create()
        }
        pub fn open_round(&mut self) -> ComponentAddress {
            assert_eq!(self.kind, 0, "Catalog required");
            let now = Consensus::current_epoch();
            assert!(now >= self.next_epoch, "Current round is still running");
            let mut start =
                self.origin_epoch + ((now - self.origin_epoch) / ROUND_EPOCHS) * ROUND_EPOCHS;
            // Don't create a round whose contribution window has already closed.
            if now
                >= start
                    .checked_add(ROUND_EPOCHS - CLOSED_EPOCHS)
                    .expect("Epoch overflow")
            {
                start = start.checked_add(ROUND_EPOCHS).expect("Epoch overflow");
            }
            assert!(!self.rounds.contains_key(&start), "Round already exists");
            self.next_epoch = start.checked_add(ROUND_EPOCHS).expect("Epoch overflow");
            let mut state = Self::empty(self.network, self.office, self.office_template, 1, start);
            state.next_epoch = self.next_epoch;
            let component = Component::new(state)
                .with_owner_rule(OwnerRule::None)
                .with_access_rules(AccessRules::allow_all())
                .create();
            self.rounds.insert(start, *component.address());
            *component.address()
        }
        pub fn contribute(&mut self, postbox: String, message: String, contribution: Bucket) {
            self.round();
            let now = Consensus::current_epoch();
            assert!(
                now >= self.origin_epoch && now < self.next_epoch - CLOSED_EPOCHS,
                "Contributions are closed"
            );
            assert!(
                self.entries.len() < MAX_ENTRIES,
                "Round entry limit reached"
            );
            assert!(
                !message.trim().is_empty() && message.len() <= 512,
                "Use a public message of 1 to 512 UTF-8 bytes"
            );
            assert_eq!(
                contribution.resource_address(),
                TARI_TOKEN,
                "Native test TARI only"
            );
            let amount = contribution
                .amount()
                .to_u64_checked()
                .expect("Invalid contribution amount");
            assert!(amount >= MIN_ENTRY, "Minimum contribution is 0.1 test TARI");
            let total = self.total.checked_add(amount).expect("Pot amount overflow");
            assert!(total <= MAX_POT, "Test pot limit reached");
            self.check_office();
            let controller: RistrettoPublicKeyBytes = ComponentManager::get(self.office)
                .call("postbox_controller", args![postbox.clone()]);
            CallerContext::get_signer_proof_for_public_key(controller).drop();
            let participant = self
                .participants
                .entry(postbox.clone())
                .or_insert(Participant {
                    controller,
                    amount: 0,
                    refunded: false,
                });
            assert_eq!(
                participant.controller, controller,
                "Postbox controller changed"
            );
            participant.amount = participant
                .amount
                .checked_add(amount)
                .expect("Contribution overflow");
            self.entries.push(Entry {
                postbox,
                controller,
                amount,
                message,
            });
            self.vault.deposit(contribution);
            self.total = total;
        }
        /// The seed never includes caller-controlled transaction inputs. Exactly
        /// one predetermined consensus epoch is accepted; a missed draw refunds.
        /// This prototype still needs a verified bound on L1/oracle look-ahead.
        pub fn draw(&mut self) {
            self.round();
            assert_eq!(
                Consensus::current_epoch(),
                self.next_epoch,
                "Draw only during the scheduled epoch"
            );
            assert!(
                self.winner.is_empty() && self.total > 0,
                "No available draw"
            );
            let seed = Consensus::current_epoch_hash();
            assert!(seed.as_ref().iter().any(|b| *b != 0), "Missing epoch seed");
            let mut entropy = Blake2b::<U32>::new();
            entropy.update(b"moonmail-pot-draw-v1");
            entropy.update(self.network.to_le_bytes());
            entropy.update(
                CallerContext::current_component_address()
                    .to_string()
                    .as_bytes(),
            );
            entropy.update(self.origin_epoch.to_le_bytes());
            entropy.update(seed.as_ref());
            let digest = entropy.finalize();
            // Rejection sampling avoids modulo bias. The counter is fixed by
            // the algorithm, never supplied by whoever submits the transaction.
            let limit = u64::MAX - u64::MAX % self.total;
            let mut ticket = None;
            for counter in 0u32..256 {
                let mut h = Blake2b::<U32>::new();
                h.update(digest.as_slice());
                h.update(counter.to_le_bytes());
                let hash = h.finalize();
                let n = u64::from_le_bytes(hash[..8].try_into().unwrap());
                if n < limit {
                    ticket = Some(n % self.total);
                    break;
                }
            }
            let ticket = ticket.expect("Unable to derive ticket; original funds remain refundable");
            let mut end = 0u64;
            for (postbox, participant) in &self.participants {
                end = end
                    .checked_add(participant.amount)
                    .expect("Weight overflow");
                if ticket < end {
                    self.winner = postbox.clone();
                    break;
                }
            }
            assert!(!self.winner.is_empty(), "Invalid pot weights");
            self.seed = seed.to_string();
        }
        pub fn claim(&mut self, destination: ComponentAddress) {
            self.round();
            assert!(!self.winner.is_empty() && !self.paid, "No available prize");
            let winner = self.participants.get(&self.winner).expect("Missing winner");
            CallerContext::get_signer_proof_for_public_key(winner.controller).drop();
            let account = ComponentManager::get(destination);
            assert_eq!(
                account.get_template_address(),
                BuiltinTemplate::Account.address(),
                "Use a built-in receiving account"
            );
            self.paid = true;
            account.invoke(
                "deposit",
                args![self.vault.withdraw(Amount::from(self.total))],
            );
        }
        pub fn refund(&mut self, postbox: String, destination: ComponentAddress) {
            self.round();
            assert!(
                Consensus::current_epoch() > self.next_epoch && self.winner.is_empty(),
                "Only an undrawn, expired round can refund"
            );
            let participant = self
                .participants
                .get_mut(&postbox)
                .expect("No contribution");
            assert!(!participant.refunded, "Already refunded");
            CallerContext::get_signer_proof_for_public_key(participant.controller).drop();
            let account = ComponentManager::get(destination);
            assert_eq!(
                account.get_template_address(),
                BuiltinTemplate::Account.address(),
                "Use a built-in receiving account"
            );
            participant.refunded = true;
            account.invoke(
                "deposit",
                args![self.vault.withdraw(Amount::from(participant.amount))],
            );
        }
        pub fn balance(&self) -> Amount {
            self.vault.balance()
        }
        pub fn list_rounds(&self, before: u64, limit: u32) -> Vec<(u64, ComponentAddress)> {
            assert_eq!(self.kind, 0, "Catalog required");
            self.rounds
                .iter()
                .rev()
                .filter(|(epoch, _)| before == 0 || **epoch < before)
                .take(limit.min(50) as usize)
                .map(|(epoch, address)| (*epoch, *address))
                .collect()
        }
    }
}
