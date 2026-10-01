# Themes

A theme decides how a resume and its cover letter look; it never changes what they say. Themes are YAML (or JSON) files, and a theme only needs the settings that differ from the theme it `extends` (or from the defaults). `./resumes themes show <name>` prints every setting of a theme with its current value.

## Where themes live

| Location | Seen by | Survives engine updates |
|---|---|---|
| `people/<person>/templates/themes/` | that person only | yes |
| `custom/templates/themes/` | everyone in the repository | yes |
| `shared/templates/themes/` | everyone (the engine's themes) | replaced by updates |

A theme in an earlier row replaces one of the same name in a later row, so `custom/templates/themes/modern.yaml` changes `modern` for the whole repository. A variant can also change settings for itself alone in a `style:` block:

```yaml
# people/<person>/resumes/source/variants/data-analyst.yaml
theme: modern
style:
  colors: { accent: "7C3AED" }
  corners: square
pages: 1
```

## Commands

| Command | Does |
|---|---|
| `./resumes themes list` | every theme, its layout, ATS rating, and where it comes from |
| `./resumes themes show <name>` | every setting after `extends` and defaults |
| `./resumes themes preview [--themes a,b] [--png] [--fit]` | renders a variant in each theme, with page counts |
| `./resumes themes new <name> --from <theme> [--person p]` | starts a theme that extends another |
| `./resumes themes check [name]` | reports problems: unknown settings, unreadable colors, fonts this machine lacks |
| `./resumes build-resumes --theme <name> --out <dir>` | a one-off copy in another theme, leaving the variant as it is |

## Units

- `sizes.*` and `letter.bodySize` are half-points: `20` is 10 pt.
- Spacing, margins, page sizes, indents, and `sidebar.width`/`gap` are twips: 1440 per inch, 20 per point.
- `tracking` is extra letter spacing in twips (`40` adds 2 pt between letters).
- `radius`, `header.padding`, and `sidebar.padding` are points.
- Colors are 6-digit hex values. Quote values made only of digits (`"404040"`): YAML would otherwise read them as numbers.

## Settings

### Identity and layout

| Setting | Meaning |
|---|---|
| `extends` | the theme this one starts from |
| `description` | one line shown by `themes list` |
| `layout` | `flow` (one column) or `sidebar` (a side column beside the main one) |
| `ats` | `safe`: reads cleanly in applicant tracking systems; `caution`: for resumes a person reads first |

### Fonts and colors

| Setting | Meaning |
|---|---|
| `font` | the body font when `fonts` is not given (older themes) |
| `fonts.body` | text, bullets, dates, contact details |
| `fonts.heading` | headline, section headings, entry titles (default: the body font) |
| `fonts.name` | the name (default: the heading font) |
| `colors.accent` | the theme's main color: default for headings, titles, bullets, links |
| `colors.ink` | body text |
| `colors.muted` | secondary text: dates, separators, sub lines |
| `colors.rule` | rules under headings and the header (default: accent) |
| `colors.tint` | panels and bands behind text; keep it light, since text sits on it |
| `colors.link` | links (default: accent) |

Anywhere a color is asked for (`header.name.color`, `headings.barColor`, and so on) you may give a palette name (`accent`, `ink`, `muted`, `rule`, `tint`, `link`) or a hex value.

Fonts are named, not embedded. Word users see a font only if they have it, so prefer fonts that ship with Word on Windows and Mac (Calibri, Cambria, Georgia, Arial, Trebuchet MS, Verdana). PDFs use the fonts installed where they are built; `themes check` lists any it would substitute.

### Shapes

| Setting | Meaning |
|---|---|
| `corners` | `rounded` or `square`, for panels, bands, and bars; also picks the default bullet (• or ▪) |
| `radius` | corner radius of rounded shapes |

Shapes are drawn behind the text and never hold text, so applicant tracking systems read the resume exactly as if they were not there, and the text stays readable in a viewer that drops them.

### Header (name, headline, contact line)

| Setting | Meaning |
|---|---|
| `header.align` | `left` or `center` |
| `header.panel` | a tinted panel (`colors.tint`) behind the whole header |
| `header.padding` | space between the header text and the panel's edge |
| `header.rule` | the line under the contact details: `single`, `double`, `thick`, or `none` |
| `header.ruleColor` | its color |
| `header.name` | the name's text style |
| `header.headline` | the headline's text style |
| `header.contact.color` | contact text color |
| `header.contact.separator` | text between contact items, such as `"  \|  "` or `"   •   "` |
| `header.contact.separatorColor` | its color |
| `header.contact.linkColor` | color of linked items (email, sites) |

### Section headings

| Setting | Meaning |
|---|---|
| `headings.style` | `rule` (line below), `rules` (lines above and below), `band` (tinted band behind), `bar` (accent bar beside), `underbar` (short accent bar below), or `plain` |
| `headings.align` | `left` or `center` |
| `headings.ruleColor` | color of `rule` and `rules` lines |
| `headings.barColor` | color of `bar` and `underbar` |
| `headings.case`, `headings.bold`, `headings.italic`, `headings.tracking`, `headings.color` | the heading text's style (see text styles below) |

### Entries (jobs and projects), skill groups, and one-line entries

| Setting | Meaning |
|---|---|
| `entries.dates` | `right` (aligned to the right edge) or `inline` (after the title) |
| `entries.separator` | text between an inline title and its dates, and before a link |
| `entries.title` | the entry title's text style |
| `entries.sub` | the line under the title (place, stack) |
| `entries.date` | the dates' text style |
| `labeled.style` | skill groups as `inline` ("Label: items") or `stacked` (label above items) |
| `labeled.label` | the label's text style |
| `lines.left` | the bold start of a one-line entry (school, certificate) |
| `lines.right` | its right-aligned part (year) |

### Text styles

These settings are text styles: `header.name`, `header.headline`, `headings`, `entries.title`, `entries.sub`, `entries.date`, `labeled.label`, `lines.left`, `lines.right`. Each takes:

| Key | Meaning |
|---|---|
| `case` | `none`, `upper` (capitals), or `smallcaps` |
| `bold`, `italic` | `true` or `false` |
| `tracking` | extra letter spacing in twips |
| `color` | a palette name or hex value |

### Sizes

| Setting | Meaning |
|---|---|
| `sizes.name` | the name |
| `sizes.headline` | the headline |
| `sizes.contact` | contact details |
| `sizes.sectionHeading` | section headings |
| `sizes.entryTitle` | job and project titles |
| `sizes.entrySub` | sub lines, dates, labels |
| `sizes.body` | body text and bullets |
| `sizes.bullet` | kept for older themes (bullets use `sizes.body`) |

### Page and spacing

| Setting | Meaning |
|---|---|
| `page.width`, `page.height` | paper size (12240 × 15840 is US Letter; 11906 × 16838 is A4) |
| `page.marginX` | left and right margins |
| `margins.resume.top`, `margins.resume.bottom` | resume top and bottom margins |
| `margins.letter.top`, `margins.letter.bottom` | cover letter top and bottom margins |
| `spacing.name.after`, `spacing.headline.after`, `spacing.contact.after` | space after each header line |
| `spacing.sectionHeading.before`, `spacing.sectionHeading.after` | space around section headings |
| `spacing.bullet.after`, `spacing.bullet.line` | space after each bullet; line spacing (240 = single) |
| `spacing.entryTitleBefore`, `spacing.entrySubAfter` | space before an entry and after its sub line |
| `spacing.paragraph.after`, `spacing.paragraph.line` | summary paragraph spacing |
| `spacing.labeled.after`, `spacing.labeled.line` | skill group spacing |
| `spacing.lines.after` | space after one-line entries |
| `borders.header.size`, `borders.header.space` | header rule thickness (eighths of a point) and its gap above |
| `borders.sectionHeading.size`, `borders.sectionHeading.space` | heading rule thickness and gap |
| `bulletList.char` | the bullet character, or `auto` (from `corners`) |
| `bulletList.indentLeft`, `bulletList.hanging` | bullet indents |
| `bulletList.color` | bullet color |

### Cover letters

| Setting | Meaning |
|---|---|
| `letter.bodySize` | letter text size |
| `letter.lineSpacing` | letter line spacing (240 = single) |
| `letter.paragraphAfter` | space after each paragraph |
| `letter.dateAfter` | space after the date |
| `letter.companyAfterWithRole`, `letter.companyAfterNoRole` | space after the company line |
| `letter.roleAfter` | space after the "Re:" line |

A letter uses the theme of the resume sent with it (the application record's `resume` variant), unless its own frontmatter names a `theme`.

### Sidebar layout

| Setting | Meaning |
|---|---|
| `sidebar.width` | side column width |
| `sidebar.gap` | space between the columns |
| `sidebar.panel` | a tinted panel behind the side column, on every page |
| `sidebar.padding` | how far the panel reaches past the side column's text |
| `sidebar.sections` | which kinds of section go to the side: `paragraph`, `labeled`, `entries`, `lines` (default: skill groups and one-line entries) |
| `sidebar.headingStyle` | heading style in the side column |

A section in a variant can override its column with `place: side` or `place: main`. Some applicant tracking systems read two columns side by side, line by line, which scrambles them; the sidebar theme is therefore `ats: caution`.

## Fitting to a page count

A variant with `pages: N` is fitted after rendering: when the PDF runs longer, the build retries with spacing at 85%, then 70%, then type 0.5 pt smaller, then margins at 85%, and finally spacing 60%, type 1 pt smaller, and margins 80%. Body text never goes below 9 pt. The build reports the step it used, or that the resume still does not fit and needs shortening. Fitting needs LibreOffice, since it measures the PDF.
