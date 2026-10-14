# MoonMail branding and compatibility

MoonMail is the current name of the website, npm project, local checkout and GitHub repository. The dark-blue ghost, envelope, moonlit atmosphere and haunted-post-office theme remain. The masthead, footer, browser title, wallet permission copy, funds panel, messages, current user guides, workflow names and browser verification path use MoonMail.

The GitHub Pages path is `/MoonMail/`. Builds use `MOONMAIL_BASE`, with the existing `GHOSTDROP_BASE` environment variable accepted as an alias for older development setups. Hosted browser checks use `MOONMAIL_TEST_BASE_URL`, with the earlier variable also accepted. The Pages workflow derives its path from the repository name. New invitations and public/private links use the frontend's actual base URL. A link saved for the old site path needs a working host at that path or the same fragment opened on the new site; keep private fragments private.

## Existing mail remains readable

A visual rename does not change the deployed application. `GhostDrop` is still the registered template name, `contracts/ghostdrop*` are the preserved contract source/crate paths, and the existing registry/template/resource addresses are retained. Changing those would require a separate contract deployment.

Cryptographic domain strings such as `GhostDrop` and protocol identifiers such as `gd-postbox-1` remain byte-for-byte compatible. Those strings bind encrypted letters, Sent copies, recovery capsules, saved mailbox settings and ownership proofs. Replacing them with a new marketing name would prevent recovery of existing data.

Existing `ghostdrop:pending:v1` and `ghostdrop:sapient-resume:v1` storage keys remain in use. This preserves uncertain-transaction reconciliation and the already-approved tab connection on the same origin. Brand changes do not rewrite or clear financial journals. Older donor/deployment and engine bridge environment names remain compatible operational identifiers.

Historical evidence records, archived wallet-extension files, the `ghostdrop-v2` backup branch and already-published letter contents retain their original names. They describe what was actually deployed or sent; they are not current website branding. No old mail is republished or edited by this rename.
