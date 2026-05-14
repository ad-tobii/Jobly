# DESIGN.md — Jobly Design System
# Inspired by Linear.app's dark UI aesthetic

## Overview
Jobly uses a near-black dark theme modelled on Linear.app. The aesthetic is calm, dense,
and functional — minimal chrome, high information density, precise typographic hierarchy,
and subtle interactive states. No gradients except as rare accents. No decorative shadows.
Every element earns its place.

---

## Color Palette

### Backgrounds (darkest → lightest elevation)
| Token           | Hex       | Usage                                      |
|-----------------|-----------|--------------------------------------------|
| bg-app          | #0F0F10   | Root app background (near-black)           |
| bg-subtle       | #141415   | Sidebar background                         |
| bg-surface      | #1A1A1C   | Cards, panels, modals                      |
| bg-elevated     | #202023   | Dropdowns, popovers, tooltips              |
| bg-overlay      | #2A2A2E   | Hover states on interactive surfaces       |

### Borders
| Token           | Hex       | Usage                                      |
|-----------------|-----------|--------------------------------------------|
| border-faint    | #232326   | Subtle dividers, card outlines             |
| border-default  | #2E2E32   | Standard borders, input outlines           |
| border-strong   | #3D3D42   | Focused inputs, active states              |

### Text
| Token           | Hex       | Usage                                      |
|-----------------|-----------|--------------------------------------------|
| text-primary    | #E8E8EC   | Primary content, headings                  |
| text-secondary  | #8B8B96   | Labels, metadata, descriptions             |
| text-tertiary   | #5C5C66   | Placeholders, disabled, muted captions     |
| text-disabled   | #3D3D44   | Disabled inputs, inactive nav items        |

### Accent (Linear blue — desaturated, professional)
| Token           | Hex       | Usage                                      |
|-----------------|-----------|--------------------------------------------|
| accent          | #5E6AD2   | Primary buttons, links, active nav         |
| accent-hover    | #6872D8   | Button hover                               |
| accent-subtle   | #1E2048   | Accent background tints                    |
| accent-muted    | #3A3F8F   | Accent borders, focus rings                |

### Semantic Colors
| Token           | Hex       | Usage                                      |
|-----------------|-----------|--------------------------------------------|
| success         | #4CAF7D   | Success states, ✅ ready badges            |
| success-subtle  | #122A1E   | Success background tints                   |
| warning         | #D4900A   | Low match, needs attention badges          |
| warning-subtle  | #2A1F06   | Warning background tints                   |
| error           | #E5534B   | Errors, destructive actions, failed states |
| error-subtle    | #2A0D0B   | Error background tints                     |
| info            | #4393CA   | Processing, info states                    |
| info-subtle     | #0D1E2E   | Info background tints                      |

### Match Score Colors
| Score     | Color     | Hex       |
|-----------|-----------|-----------|
| ≥ 70%     | green     | #4CAF7D   |
| 50–69%    | amber     | #D4900A   |
| < 50%     | red       | #E5534B   |

---

## Typography

**Font Family:** Inter (primary), Inter Display (headings ≥ 20px)
**Fallback:** -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

### Scale
| Token         | Size  | Weight | Line Height | Usage                          |
|---------------|-------|--------|-------------|--------------------------------|
| text-xs       | 11px  | 400    | 1.4         | Metadata, timestamps, badges   |
| text-sm       | 13px  | 400    | 1.5         | Body text, labels              |
| text-base     | 14px  | 400    | 1.6         | Default UI text                |
| text-md       | 15px  | 500    | 1.5         | Card titles, section headers   |
| text-lg       | 17px  | 500    | 1.4         | Page section headings          |
| text-xl       | 20px  | 600    | 1.3         | Page titles (Inter Display)    |
| text-2xl      | 24px  | 600    | 1.2         | Auth headings (Inter Display)  |

### Rules
- No text below 11px
- Headings use Inter Display at ≥ 20px
- Body/UI copy uses regular Inter
- Letter spacing: -0.01em on headings, 0 on body
- Never use font-weight above 600 in dark UI

---

## Spacing

Base unit: 4px

| Token   | Value | Usage                                     |
|---------|-------|-------------------------------------------|
| space-1 | 4px   | Icon gaps, tight inline spacing           |
| space-2 | 8px   | Input padding (vertical), badge padding   |
| space-3 | 12px  | Card inner padding (tight)                |
| space-4 | 16px  | Standard component padding                |
| space-5 | 20px  | Section padding (internal)                |
| space-6 | 24px  | Card padding, modal padding               |
| space-8 | 32px  | Section gaps                              |
| space-12| 48px  | Page-level vertical spacing              |

---

## Border Radius

| Token    | Value | Usage                                      |
|----------|-------|--------------------------------------------|
| radius-sm| 4px   | Badges, tags, small chips                  |
| radius-md| 6px   | Inputs, buttons, cards                     |
| radius-lg| 8px   | Modals, drawers, panels                    |
| radius-xl| 12px  | Overlays, bottom sheets                    |

---

## Components

### Buttons
**Primary**
- bg: accent (#5E6AD2), text: white
- hover: accent-hover (#6872D8)
- padding: 8px 16px, radius: 6px, font: 14px/500
- disabled: opacity 0.4, cursor not-allowed

**Ghost / Secondary**
- bg: transparent, border: border-default, text: text-secondary
- hover: bg-overlay
- same sizing as primary

**Destructive**
- bg: error (#E5534B), text: white
- hover: darken 8%

**Icon Button**
- 32×32px, radius: 6px, bg: transparent
- hover: bg-overlay

### Inputs
- bg: bg-surface (#1A1A1C)
- border: border-default, focus: border-strong + accent focus ring (2px, accent-muted)
- text: text-primary, placeholder: text-tertiary
- padding: 8px 12px, radius: 6px, font: 14px
- error state: border-color: error, no background change

### Cards
- bg: bg-surface (#1A1A1C)
- border: 1px solid border-faint
- radius: 8px
- padding: 16px
- hover: border-color → border-default (subtle lift)
- NO box-shadow — Linear uses border only, no shadows

### Badges / Status Pills
- Small pill: 4px radius, 4px 8px padding, 11px font
- Processing: bg info-subtle, text info
- Recommended: bg success-subtle, text success
- Low match: bg warning-subtle, text warning
- Failed: bg error-subtle, text error
- Applied: bg bg-overlay, text text-secondary

### Sidebar
- Width: 220px expanded, 48px collapsed
- bg: bg-subtle (#141415)
- Right border: border-faint
- Nav items: 32px height, 8px 12px padding, radius: 6px
- Active nav: bg accent-subtle, text accent, left border 2px accent
- Hover nav: bg bg-overlay

### Modal / Dialog
- Backdrop: rgba(0,0,0,0.6) blur(4px)
- Panel: bg-surface, border border-default, radius-lg
- Max-width: 480px (standard), 560px (large)
- Header: 16px/600, border-bottom border-faint
- Padding: 24px

### Progress Bar
- Track: bg-overlay
- Fill: accent for neutral, success for score ≥ 70, warning for 40–69
- Height: 4px, radius: full (pill)
- Animated fill on mount

### SSE Status Dot
- Size: 8px circle
- Blue pulse (processing): #4393CA with CSS keyframe pulse animation
- Green static (ready): #4CAF7D
- Amber static (low match): #D4900A
- Red static (failed): #E5534B
- Hidden when applied/dismissed

### Skeleton / Loading
- bg: bg-overlay (#2A2A2E) with shimmer animation (left-to-right sweep)
- Radius matches the element it's replacing
- Never show raw spinners alone — combine with text where space allows

### Toasts
- Position: bottom-right, 16px margin
- bg: bg-elevated, border: border-default, radius: 8px
- Icon + message, 14px
- Success: success icon, auto-dismiss 3s
- Error: error icon, manual dismiss
- Info: info icon, auto-dismiss 5s

---

## Layout

### Sidebar + Main Shell
- Sidebar: fixed left, full height, 220px (or 48px collapsed)
- Main content: margin-left: sidebar width, fills remaining viewport
- No top navigation bar on desktop — sidebar is the only nav
- On mobile: sidebar hidden, replaced by top bar + hamburger drawer

### Page Header
- Height: ~56px
- Padding: 0 24px
- Border-bottom: border-faint
- Page title: text-xl (Inter Display)
- Actions: right-aligned, gap: 8px

### Content Area
- Padding: 24px
- Max content width: none (fills available)
- Section gaps: 32px

---

## Icons
- Size: 16px (inline UI), 20px (nav items), 24px (empty states, feature icons)
- Style: outline/stroke, 1.5px stroke weight — Linear-style minimal icons
- Color: text-secondary default, text-primary on hover/active, accent on active nav

---

## Motion / Animation
- Duration: 120ms (micro interactions), 200ms (panels/modals), 300ms (drawers/sheets)
- Easing: cubic-bezier(0.16, 1, 0.3, 1) — fast out, ease in (Linear's signature)
- Sidebar collapse/expand: 200ms width transition
- Modal: 200ms opacity + 8px translateY up
- Drawer: 300ms translateX from edge
- Skeleton shimmer: 1.5s linear infinite

---

## Do's and Don'ts

### DO
- Use bg-surface for cards, never bg-app directly
- Use border-only cards — no box-shadow
- Keep text secondary for metadata, primary only for main content
- Use accent sparingly — only for primary CTAs and active states
- Match score badges always use the colour scale (green/amber/red)
- Skeletons for all async content — never blank white space

### DON'T
- Don't use pure #000000 or #FFFFFF — always use the token scale
- Don't use gradients except as extremely subtle background accents
- Don't stack multiple shadows
- Don't use border-radius above 12px
- Don't use more than 2 font weights in a single component
- Don't use coloured icon backgrounds (Linear removed these in 2024 refresh)
- Don't over-use accent colour — it should feel intentional, not everywhere
