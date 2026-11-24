# Family Tree Finder

Build a family tree and keep the evidence beside it. Family Tree Finder is a free static web app. It opens with the fictional Bramblewick family. Choose **Start my tree** to begin a separate private tree with yourself.

[Open the GitHub Pages demo](https://almjason01-sys.github.io/family-tree-finder/)

## Find your first ancestor

1. Add yourself and a relative you can identify. Enter a citation for each assertion. Use **Confirmed** for an official record, obituary or the person's firsthand statement, **Lead / Believed** for unproven claims and **Ruled out** for disproved claims.
2. Open a relative's **Free-first research ladder**. Search by names, years, places and relatives. Start with the 1920, 1930, 1940 and 1950 U.S. censuses. Log the household members, ages, relationships and occupations.
3. Continue with death indexes and certificate numbers, SSA / SS-5 applications, WWII draft cards, marriage records, birth certificates, obituaries, newspapers and FamilySearch. Log the record, cost and research purpose as a **PAID OPTION** before considering a purchase.
4. Compare birth year, place, parents, spouse, children and death place before accepting a candidate. Keep look-alikes in **Do NOT add**. Record spelling variants and log a social cross-check or skip. Use age flags and open questions to draft messages for relatives.
5. Run **Two-pass review**. Compare sources, keep both values visible when they conflict, and select a value only after you decide. Export the Markdown handoff when you want to pass the work along.

The **Research guide** in the app includes the checklist and collection links. The ladder uses U.S. collections. For other countries, use the corresponding local archives and civil records.

## Use the tree

- **View as** stars and centers a person. Parents appear above, siblings beside them and children below. **Whole family** arranges the tree from oldest generation to youngest. Search names or use the side and surname filters. Zoom and drag or scroll the canvas.
- Click a person for facts, relationships, citations, notes, images and open questions. Add individual assertions from different sources. Record surname origins, immigration and earliest confirmed ancestors in **Surname heritage**.
- Edits save in browser storage. Every edit updates the current handoff date and keeps the previous version in the archive. Download a fresh handoff after working on the tree. Files you already downloaded are separate copies.
- JSON is a full backup. Markdown contains readable research and a rebuild payload. GEDCOM includes people and standard family records for use in other genealogy tools, plus a private extension for full Family Tree Finder round-tripping. Other tools may drop the extension. External GEDCOM import supports names, vital dates and places and family links, entering them as leads.

### Continue with family or an AI assistant

Attach the Markdown handoff in a chat that supports file uploads, or send it to a family member you trust. Ask them to continue from the open questions and cite any new evidence they find. Keep the original file if you want to rebuild the tree in the app.

## Privacy

Private trees are separate from the public demo. The app stores tree content on the device, without an app account or backend. Export a backup before clearing browser data. Citation and collection links open external websites when clicked.

Full exports include private data and archived versions. The optional redacted outline link contains only a limited snapshot in the URL fragment. It omits names for people without a confirmed death year, and removes places, exact dates, notes, citations and images. Anyone who has the link can see the remaining family structure. Preview it before sharing.

## Run and deploy

Serve the repository with a static HTTP server, for example `python3 -m http.server 8000`. Open `http://localhost:8000` in a current browser. There are no dependencies to install.

For GitHub Pages, open **Settings → Pages**, choose **Deploy from a branch**, and select **main** and **/ (root)**. GitHub Pages publishes changes pushed to that branch. [GitHub Pages publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

[MIT license](LICENSE)
