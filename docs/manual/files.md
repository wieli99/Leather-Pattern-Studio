# Files, recovery and offline use

Save and Save as use native file pickers where supported. Other browsers download a JSON copy; a download notification does not guarantee a disk write. Open accepts saved project files. New and Open ask before replacing unsaved work.

Recovery is stored separately in browser storage and offered at startup. It is not a substitute for saved files: storage may be denied, cleared, or evicted.

Current files use version 10, including attached stitch groups. Versions 1–9 migrate on opening. Older application builds cannot open version-10 files. Inactive legacy stitch metadata is preserved.

Offline use requires a successful online load and completed cache installation in a production build. Development mode does not enable offline caching. The manual is bundled and precached too. Save before accepting an application update.
