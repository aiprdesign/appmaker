# Third-party software

Appmaker uses open-source packages only. A licence check of the full production
dependency tree (667 packages) found:

| Licence | Packages | Commercial use |
|---|---|---|
| MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, Unlicense, Zlib | ~650 | Yes, keep the notices |
| MPL-2.0: axe-core | 1 | Yes. Used unmodified (WCAG audits of website previews); its licence ships as `public/preview/axe-core-LICENSE.txt` |
| LGPL-3.0: libvips binaries inside `sharp` (Next.js image optimisation) | 2 | Yes, dynamically linked and unmodified |
| CC-BY-4.0: caniuse-lite (browser data used at build time) | 1 | Yes, with attribution |
| Dual licences, the permissive one applies: jszip (MIT), node-forge (BSD-3-Clause), type-fest (MIT) | 3 | Yes |
| BUSL-1.1: `@expo/logger`, `@expo/steps`, `@expo/turtle-spawn` (inside Expo's official `eas-cli`) | 3 | Yes for Appmaker's use: they run Expo's own CLI against Expo's own build service. BUSL only restricts offering a competing build service built from that code |

What generated apps and websites use is also open and commercially safe:
React Native and Expo (MIT), Lucide icons (ISC), Tailwind CSS (MIT), Google Fonts
(SIL Open Font License), and the business's own photos. The AI is told never to
copy other companies' designs, text or images, or to use licensed stock or fonts.

To re-check: `npm ls --omit=dev --all --parseable` and read each package's licence.
