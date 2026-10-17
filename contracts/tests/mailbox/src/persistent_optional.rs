use ghostdrop_v3::ghostdrop_v3::GhostDrop;
use tari_template_lib::prelude::*;

#[test]
fn persisted_root_empty_optional_arrays_decode_without_changing_identity() {
    let template: TemplateAddress = "11".repeat(32).parse().unwrap();
    let resource: ResourceAddress = format!("resource_{}", "22".repeat(32)).parse().unwrap();
    for null in [true, false] {
        let mut e = tari_bor::minicbor::Encoder::new(Vec::new());
        e.array(9)
            .unwrap()
            .u8(38)
            .unwrap()
            .map(0)
            .unwrap()
            .map(0)
            .unwrap();
        e.encode(template).unwrap().map(0).unwrap().u8(0).unwrap();
        for _ in 0..2 {
            if null {
                e.null().unwrap();
            } else {
                e.array(0).unwrap();
            }
        }
        e.encode(Some(resource)).unwrap();
        let state: GhostDrop = tari_bor::decode_exact(&e.into_writer()).unwrap();
        assert_eq!(state.resource(), resource);
    }
}

#[test]
fn absent_codec_does_not_hide_a_nonempty_invalid_envelope() {
    use ghostdrop_v3::letter::letter::Envelope;
    let mut decoder = tari_bor::minicbor::Decoder::new(&[0x81, 0x80]);
    let result: Result<Option<Envelope>, _> = ghostdrop_v3::optional::decode(&mut decoder, &mut ());
    assert!(result.is_err());
}
