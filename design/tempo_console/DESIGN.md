---
name: Tempo Console
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#464555'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#003fac'
  on-tertiary: '#ffffff'
  tertiary-container: '#0555dd'
  on-tertiary-container: '#d1daff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  display-xl:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.03em
  display-xl-mobile:
    fontFamily: Geist
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.015em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: -0.005em
  label-xs:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  metric-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.03em
  metric-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  code-badge:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  gutter-sidebar: 15rem
  gutter-utility-rail: 20rem
  density-row-compact: 1.75rem
  density-row-normal: 2.25rem
---

## Brand & Style

This design system embodies the discipline of high-performance work software: quiet, rigorous, precise, and unobtrusive. Built for engineers, founders, researchers, and knowledge workers who treat their calendar, focus windows, and task pipeline as an integrated instrument. It channels the understated craftsmanship of Linear, the utilitarian speed of Raycast, and the serene spatial logic of Notion Calendar.

### Personality & Tone
- **Tactile Instrument:** Feels like an impeccably engineered piece of hardware. Interactions are instantaneous, discrete, and predictable.
- **Cognitive Quiet:** High semantic density achieved through whitespace discipline, hairline precision, and muted hierarchy rather than screaming accent colors or arbitrary graphics.
- **Serious Utility:** Zero cartoonish streaks, confetti celebrations, or superficial gamification. Focus is earned through frictionless clarity and temporal sovereignty.

### Design Movement
- **Precision Modernism:** Combines razor-thin structural borders (`1px`), subtle tonal surface elevations, crisp monospace metrics, and restrained typography. Contrast is controlled through deep ink tones and muted zinc secondary labels, maintaining absolute legibility under intense desktop focus.

## Colors

The palette is engineered around an architectural hierarchy of muted slates and pure white surfaces, anchored by a deep indigo core for deliberate focal targets.

### Canvas & Surface Hierarchy
- **Canvas Base:** `#F9F9FA` — An ultra-subtle warm-slate foundation that reduces harsh optical glare over long working sessions.
- **Surface Level 0 (Panel/Card):** `#FFFFFF` — Sharp, clean foreground for active document nodes, task drawers, and day views.
- **Surface Level 1 (Recessed/Muted):** `#F3F4F6` — Used for secondary toolbars, timeline gutter grids, sidebar navigation, and inactive states.
- **Surface Level 2 (Selected/Active Hover):** `#ECEEF2` — Subtle tactile feedback states for list items and command palette rows.

### Text & Contrast Hierarchy
- **Text Ink Primary:** `#111827` (Zinc 900) — Deep, authoritative contrast for primary tasks, metrics, and headlines.
- **Text Ink Secondary:** `#6B7280` (Zinc 500) — Timestamps, metadata tags, shortcut indicators, and helper annotations.
- **Text Ink Tertiary / Disabled:** `#9CA3AF` (Zinc 400) — Structural hints and watermarks.

### Accent & Functional
- **Primary Accent:** `#4F46E5` (Indigo 600) — Reserved strictly for focused timeline blocks, primary execution CTAs, and active timer sweeps.
- **Structural Accent:** `#0F172A` (Slate 900) — Monochromatic grounding for key state toggles, command menus, and dark tooltips.
- **Hairline Border:** `#E5E7EB` (Zinc 200) — 1px dividers defining layout zones with surgical clarity.

## Typography

Typography functions as the architectural scaffolding of the interface. The pairing of `Geist` with `JetBrains Mono` balances geometric modernist rhythm with technical exactitude.

### Typographic Principles
- **Tabular Figures for Temporal Flow:** All timers, timestamps, progress ratios, and durations must use `font-feature-settings: "tnum" 1` or `JetBrains Mono` to prevent layout shift during second-by-second updates.
- **Tight Tracking at Scale:** Display and headline levels utilize tight negative letter spacing (`-0.03em` to `-0.015em`), producing dense, intentional titles typical of desktop utility panels.
- **Compact Body Scale:** The baseline reading size is established at `13px` to `14px`, allowing for high informational yield without visual clutter.

## Layout & Spacing

The interface is structured around a desktop-first, column-anchored work console layout that maximizes vertical efficiency and multi-pane spatial reasoning.

### Layout Model
- **Three-Tier Workspace Architecture:**
  1. **Primary Navigation Rail (Left):** Collapsible `15rem` panel hosting focus scopes, project folders, and calendar integrations.
  2. **Core Temporal Grid (Center):** A fluid, multi-column calendar/timeline stream utilizing fixed 30-minute and 15-minute horizontal division increments.
  3. **Context / Inspector Rail (Right):** Fixed `20rem` or `24rem` drawer for task checklists, notes, and session analytics.
- **Density Grid Rhythm:** All structural units strictly increment along a 4px/8px modular scale. Dense data lists conform to `density-row-compact` (28px) for high-cadence triage or `density-row-normal` (36px) for standard timeline events.

### Form Factor Behavior
- **Desktop (≥ 1280px):** Simultaneous visibility of navigation, core canvas, and inspector.
- **Laptop / Tablet Landscape (768px - 1279px):** Inspector slides into an overlay drawer triggered via keyboard shortcut (`Cmd + I`); navigation snaps to a minimalist 48px icon rail.
- **Mobile Handheld (< 768px):** Reflows to a single-view card stream with fixed bottom navigation switching between Focus, Calendar, and Tasks.

## Elevation & Depth

This system avoids heavy, atmospheric skeuomorphism in favor of tactile **low-contrast boundaries** and disciplined **tonal layers**.

### Depth Hierarchy
1. **Level 0 (Recessed Base):** `#F9F9FA` canvas background without shadows or borders.
2. **Level 1 (Card & Module Layer):** `#FFFFFF` surfaces defined by a crisp `1px solid #E5E7EB` border. Elevation is signaled purely through material contrast against the `#F9F9FA` canvas.
3. **Level 2 (Active Flyouts & Dropdowns):** Subtle ambient diffusion:
   - `box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 4px 12px 0 rgba(0, 0, 0, 0.03)`
   - Border: `1px solid #E5E7EB`
4. **Level 3 (Modal Overlay / Command Palette):** 
   - `box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06), 0 16px 36px -8px rgba(15, 23, 42, 0.12), 0 6px 12px -4px rgba(15, 23, 42, 0.04)`
   - Backdrop filter: `blur(4px) saturate(140%)` over `rgba(249, 249, 250, 0.8)`.

## Shapes

The geometric signature uses **Soft (`1`)** rounding. Radii are intentionally kept modest to convey technical precision, tool-like sharpness, and efficient screen real estate utilization.

### Geometry Values
- **Micro Radii (`2px - 4px`):** Checkboxes, status badges, keyboard command caps (`Kbd`), and micro-tags.
- **Control Radii (`6px` / `0.375rem`):** Buttons, text input fields, dropdown menus, and list row selection states.
- **Panel & Modal Radii (`8px` / `0.5rem`):** Calendar time blocks, major inspector cards, and command palettes.
- **Containers larger than 600px:** Capped strictly at `8px` to maintain architectural rigidity. Never use oversized pill curves except for persistent recording timer badges.

## Components

### Buttons
- **Primary:** Background `#0F172A`, text `#FFFFFF`, height `32px`, padding `0 12px`, radius `6px`. Font: `Geist` 13px weight 500. Hover: `#1E293B`.
- **Secondary (Ghost Outline):** Background `#FFFFFF`, border `1px solid #E5E7EB`, text `#111827`. Hover: background `#F3F4F6`, border `#D1D5DB`.
- **Accent (Focus/Timer Start):** Background `#4F46E5`, text `#FFFFFF`. Hover: `#4338CA`.
- **Icon Utility Button:** 28×28px, transparent background, text `#6B7280`, radius `4px`. Hover: background `#ECEEF2`, text `#111827`.

### Chips & Micro-Badges
- **Keyboard Shortcut (`Kbd`):** Height `18px`, min-width `18px`, padding `0 4px`, radius `3px`, background `#FFFFFF`, border `1px solid #E5E7EB`, box-shadow `0 1px 0 0 #D1D5DB`, font `JetBrains Mono` 10px, text `#6B7280`.
- **Status Badges:** Height `20px`, padding `0 6px`, radius `4px`, font `Geist` 11px weight 500.
  - *Focus Active:* Background `#EEF2FF`, border `1px solid #C7D2FE`, text `#4338CA`.
  - *Neutral Queued:* Background `#F3F4F6`, border `1px solid #E5E7EB`, text `#4B5563`.

### Lists & Row Items
- Compact layout with height `32px` or `36px`, padding `0 8px`, border-radius `4px`.
- Left-aligned indicator/checkbox, title clamped in primary ink, right-aligned tabular timer/metadata.
- Hover state: Background `#F3F4F6`. Selected state: Background `#ECEEF2`, left edge subtle indicator bar `2px solid #4F46E5`.

### Checkboxes & Selection Controls
- Checkbox: 14×14px, radius `3px`, border `1.25px solid #D1D5DB`, background `#FFFFFF`.
- Checked state: Background `#0F172A`, border-color `#0F172A`, white hairline check mark.
- Focus visible: `box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #4F46E5`.

### Input Fields
- Height `32px`, font `Geist` 13px, background `#FFFFFF`, border `1px solid #E5E7EB`, radius `6px`, padding `0 10px`.
- Focus state: Border `1px solid #4F46E5`, outline `none`, subtle ring `0 0 0 3px rgba(79, 70, 229, 0.12)`.
- Placeholder: `#9CA3AF`.

### Cards & Focus Blocks
- Time-blocking nodes: Background `#FFFFFF`, border `1px solid #E5E7EB`, left edge color strip (`3px`) denoting task category.
- When active/current: Border color `#C7D2FE`, box-shadow `0 2px 8px -2px rgba(79, 70, 229, 0.08)`.

### Command Palette (Spotlight Console)
- Width `560px`, border `1px solid #E5E7EB`, background `#FFFFFF`, radius `8px`.
- Top input row height `48px`, font size `15px`, borderless with bottom border divider `1px solid #F3F4F6`.
- Results list maximum height `320px`, item hover/focus background `#F3F4F6`, immediate breadcrumbs rendered in `JetBrains Mono`.