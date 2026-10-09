//! Persistent substates can return an absent value as null or an empty array.
//! Keep the canonical Option encoding and accept only those two absent forms.
use tari_template_lib::prelude::tari_bor::minicbor::{
    CborLen, Decode, Decoder, Encode, Encoder,
    data::Type,
    decode::Error,
    encode::{Error as EncodeError, Write},
};
pub fn encode<C, T: Encode<C>, W: Write>(
    value: &Option<T>,
    e: &mut Encoder<W>,
    ctx: &mut C,
) -> Result<(), EncodeError<W::Error>> {
    match value {
        Some(value) => value.encode(e, ctx),
        None => {
            e.null()?;
            Ok(())
        }
    }
}
pub fn decode<'b, C, T: Decode<'b, C>>(
    d: &mut Decoder<'b>,
    ctx: &mut C,
) -> Result<Option<T>, Error> {
    if d.datatype()? == Type::Null {
        d.null()?;
        return Ok(None);
    }
    if d.datatype()? == Type::Array {
        let mut peek = d.clone();
        if peek.array()? == Some(0) {
            d.array()?;
            return Ok(None);
        }
    }
    T::decode(d, ctx).map(Some)
}
pub fn cbor_len<C, T: CborLen<C>>(value: &Option<T>, ctx: &mut C) -> usize {
    match value {
        Some(value) => value.cbor_len(ctx),
        None => 1,
    }
}
