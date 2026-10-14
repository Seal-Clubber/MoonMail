use bech32::{Bech32m, primitives::decode::CheckedHrpstring};
use blake2::{Blake2b, Digest, digest::consts::U64};
use tari_template_lib::{intrinsics::*, prelude::*, types::crypto::Scalar32Bytes};

// Ootle's Bech32m codec: HRP supplies the network, then owner || view key.
// Restrict claims to canonical lowercase addresses without a payment reference.
pub fn address_owner(address: &str, network: u8) -> Option<RistrettoPublicKeyBytes> {
    if address.len() > 128 || !address.is_ascii() {
        return None;
    }
    let expected_hrp = match network {
        16 => "otl_loc_",
        36 => "otl_igr_",
        38 => "otl_esm_",
        _ => return None,
    };
    let checked = CheckedHrpstring::new::<Bech32m>(address).ok()?;
    if checked.hrp().as_str() != expected_hrp {
        return None;
    }
    let data: Vec<u8> = checked.byte_iter().collect();
    if data.len() != 64 || bech32::encode::<Bech32m>(checked.hrp(), &data).ok()? != address {
        return None;
    }
    let owner: RistrettoPublicKeyBytes = <[u8; 32]>::try_from(&data[..32]).ok()?.into();
    let view: RistrettoPublicKeyBytes = <[u8; 32]>::try_from(&data[32..]).ok()?.into();
    if !ristretto_is_canonical(&owner)
        || !ristretto_is_canonical(&view)
        || ristretto_is_identity(&owner)
        || ristretto_is_identity(&view)
    {
        return None;
    }
    Some(owner)
}
fn domain_hash(tag: &str, fields: &[&[u8]]) -> [u8; 64] {
    let mut h = Blake2b::<U64>::new();
    h.update((tag.len() as u64).to_le_bytes());
    h.update(tag.as_bytes());
    for field in fields {
        h.update((field.len() as u64).to_le_bytes());
        h.update(field);
    }
    h.finalize().into()
}
pub fn verify(
    network: u8,
    address: &str,
    challenge: &str,
    controller: RistrettoPublicKeyBytes,
    nonce: RistrettoPublicKeyBytes,
    scalar: Scalar32Bytes,
) -> bool {
    if address_owner(address, network) != Some(controller)
        || challenge.is_empty()
        || !challenge.is_ascii()
        || challenge.len() > 500
        || !ristretto_is_canonical(&nonce)
        || !scalar_is_canonical(&scalar)
    {
        return false;
    }
    if ristretto_is_identity(&nonce) {
        return false;
    }
    let message = domain_hash(
        "com.tari.paylink.wallet_ownership_proof.v1.v1",
        &[&[network], address.as_bytes(), challenge.as_bytes()],
    );
    let hash = domain_hash(
        "com.tari.schnorr_signature.v1.challenge",
        &[nonce.as_bytes(), controller.as_bytes(), &message],
    );
    ristretto_mul_base(&scalar)
        == ristretto_add(
            &nonce,
            &ristretto_mul(&controller, &scalar_from_uniform_bytes(&hash)),
        )
}
pub fn canonical_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn scalar_hex(value: &str) -> Scalar32Bytes {
    assert!(canonical_hex(value), "Invalid proof scalar");
    let mut bytes = [0u8; 32];
    for (i, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).expect("Invalid hex");
    }
    bytes.into()
}
