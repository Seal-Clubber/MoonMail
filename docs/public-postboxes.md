# Public postbox details, encrypted letters

A registered MoonMail postbox has a public name, ID, controlling public key and encryption-key history on Ootle. The earlier unlisted option only filtered the website’s directory; anyone could still read the registration directly from the contract.

The website no longer offers a hide/listing checkbox or an unlisted badge. Both the directory and Compose recipient choices include every registered postbox, including registrations with an old `discoverable: false` flag. Favourites and verified correspondents still appear first. Search works by name or complete ID. Invitations remain usable and give no wallet or inbox access.

Creation and editing clearly explain which postbox details are public. New registrations use the normal listed contract value. Editing names or rotating keys preserves an older listing flag as stored metadata; there is no automatic transaction to change it. The current website ignores that flag for directory filtering. Existing third-party/older clients may still interpret it differently. No new template or migration is required.

Private letters remain sealed: subjects, bodies, recipient/reply addressing and payment-request details stay encrypted. Reading permission is separate from spending. Removing a directory filter does not decrypt messages, change recovery keys or spend funds.

Private postbox identities with encrypted names and invitation-based discovery remain a future design idea, not an implemented feature. Transaction signers and timing may still be visible even with such a design. MoonMail does not promise anonymity. [Current privacy capabilities](private-email.md).
