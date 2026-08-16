# Bundled typefaces

Both are self-hosted rather than loaded from a font CDN: a CDN sees every page
load, which a privacy-focused self-hosted application should not require of the
people running it.

| Font | Licence | Source |
| --- | --- | --- |
| Cormorant Garamond | SIL Open Font License 1.1 | <https://github.com/CatharsisFonts/Cormorant> |
| Crimson Pro | SIL Open Font License 1.1 | <https://github.com/Fonthausen/CrimsonPro> |

Both are variable fonts carrying a weight axis, subset to Latin, Latin
Extended-A/B, Latin Extended Additional and general punctuation. Author and
publisher names run well past ASCII, so the extended ranges are not optional.

Subset with:

```sh
pyftsubset FONT.ttf --output-file=FONT.woff2 --flavor=woff2 \
  --unicodes="U+0000-00FF,U+0100-017F,U+0180-024F,U+0259,U+1E00-1EFF,U+2000-206F,U+2074,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features='kern,liga,clig,calt,onum,tnum,frac' \
  --name-IDs='*' --notdef-outline --recalc-bounds --drop-tables+=DSIG
```

That took 1.4 MB of TTF down to 114 KB of woff2 with the weight axes intact.
The OFL requires the licence to travel with the font; keep this file next to
them, and add both rows to the Licences page when one exists.
