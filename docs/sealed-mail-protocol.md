# Sealed mail protocol (unpublished V4)

This protocol is disabled in the published deployment. The existing V3 office,
keys, ciphertext formats and financial journals retain their original identities.
Do not select V4 until stock Sapient and independent recovery have been verified.

## Envelope and recovery

`mm-sealed-2` stores one padded AES-256-GCM message and exactly two encrypted
content-key slots. A fresh ephemeral Ristretto key performs SDK-provided DH with
the receiving key and the sender's recovery key. HKDF-SHA256 derives each wrapping
key. Slot order is randomized; neither slot publishes a mailbox, public receiving
key, controller, capsule locator, role or conversation identifier. Each wrapping
operation has its own random nonce and binds its index and the encrypted body.
The body binds network, registry, template, letter ID, ephemeral key and the
contract-recorded transaction signer. Copying it under another signer cannot
impersonate the original sender.

The protected `mm-message-1` body contains the complete subject and text, both
mailbox identities/key versions, optional reply identity and encrypted thread
links. It is padded to 1,024, 2,048, 4,096, 8,192 or 16,384 bytes, including its
four-byte length prefix. The maximum envelope stays below 24,000 JSON bytes; the
contract additionally checks the complete child component fits 32,768 CBOR bytes.
This is a deliberate bounded format, not an increase to the existing mail limit.

V4 postboxes retain up to sixteen contiguous encryption-key versions, including
their immutable recovery capsule references. Rotation must use a fresh key and
capsule; an existing historical version is never evicted. The controller's proof
is required. Key history is public directory data; it is absent from each sealed
envelope. Recovery still requires the user's separate account-wide private-view
permission in Sapient. No financial seed or signing key is requested.

## Conversations and discovery

An optional conversation nonce is random and encrypted. A reply key is derived
from the sender's recovered mailbox secret plus that nonce and deployment
context. Recovering the sender's encrypted Sent slot recovers the descriptor
needed to derive that key again. This separates conversation encryption keys;
it does not create a separate wallet account or hide the transaction signer.

Discovery tries at most fifty ciphertexts against sixteen historical mailbox
keys and at most 128 validated conversation descriptors. It first restores base
Inbox/Sent entries, then tries derived reply keys. If a later page restores a new
Sent descriptor, earlier unmatched pages must be revisited. Cursors, cancellation
and unavailable entries remain explicit. No recipient-specific indexer lookup
is used. Derived secrets and plaintext remain in memory and must be cleared on
disconnect, account change, view revocation or leaving the session.

Opening a message with a key does not alone assign it to an inbox or Sent.
Decrypted mailbox ID, key version and encryption key must match the recovered
identity. Sent additionally requires its controller to equal the authenticated
transaction signer. Public directory identity must be checked before displaying
a sender's nickname. An unknown or malformed route is not a contact.

## Chain boundary and activation

The V4 root has eleven positional fields, with kind at index seven; V3 has nine
and kind at index five. Dedicated codecs verify template, owner rule, resource,
directory membership, child kind, registry and network. Trailing optional `None`
fields can be omitted on child components. An unexpected version must fail
closed, never be guessed through the old codec.

The separate `moonmail-sealed-1` profile requires recorded engine, recovery,
stock-Sapient and Sent/reply evidence. Private postage also requires its own
deployment evidence and the account's current capability. No published profile
currently enables this protocol. Public consent, payment approval and private
view permission remain separate.

`publish_sealed` stores ciphertext without a gift withdrawal. Native private
payments are separate operations and are not atomic attachments here. Payment
handoff must not be advertised until recipient import and interrupted-delivery
recovery are implemented and tested. Current V3 gifts retain their tested public
vault and prepaid collection rules.

Others can still observe transaction signers, timing, office/template identifiers,
opaque letter/component IDs, size buckets and private-output commitments. Public
postbox registration/controller associations and key rotation are also observable.
Hosts/indexers can observe connection information; scanning is not anonymity.
