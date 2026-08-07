---
name: Solaris Slate
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#d1c6ab'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#9a9078'
  outline-variant: '#4d4632'
  surface-tint: '#eec200'
  primary: '#ffecb9'
  on-primary: '#3c2f00'
  primary-container: '#facc15'
  on-primary-container: '#6c5700'
  inverse-primary: '#735c00'
  secondary: '#b9c8de'
  on-secondary: '#233143'
  secondary-container: '#39485a'
  on-secondary-container: '#a7b6cc'
  tertiary: '#c7f5ff'
  on-tertiary: '#00363e'
  tertiary-container: '#33e4ff'
  on-tertiary-container: '#006270'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe083'
  primary-fixed-dim: '#eec200'
  on-primary-fixed: '#231b00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#d4e4fa'
  secondary-fixed-dim: '#b9c8de'
  on-secondary-fixed: '#0d1c2d'
  on-secondary-fixed-variant: '#39485a'
  tertiary-fixed: '#a0efff'
  tertiary-fixed-dim: '#15daf4'
  on-tertiary-fixed: '#001f25'
  on-tertiary-fixed-variant: '#004e59'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

# Solaris Slate

## Brand & Style

The design system moves away from typical tech-neon palettes toward a high-contrast, industrial-luxe aesthetic. It targets professional environments that demand high legibility and a sense of "prestige" utility.

The style is **Modern-Industrial**: combining the precision of a systematic layout with the warmth of a rich yellow primary hue. It leverages deep slate backgrounds to ground the interface, while the primary yellow acts as a high-visibility signal for action and focus. The emotional response should be one of focused energy, reliability, and technical sophistication.

## Colors

The palette is built on a "Deep Midnight" foundation to ensure the primary yellow vibrates with intent without causing eye strain.

- **Primary (#FACC15):** A vibrant, saturated yellow used for critical actions, active states, and focus indicators.
- **Secondary (#94A3B8):** A muted slate gray used for de-emphasized text and iconography to maintain visual hierarchy.
- **Neutral (#0F172A):** The foundational background color, providing a solid, dark base.
- **Surface (#1E293B):** A lighter slate used for cards, modals, and container elements to create depth.

## Typography

The typography strategy blends contemporary grotesque precision with technical monospaced utility.

- **Headlines:** Use Hanken Grotesk with tight letter-spacing and heavy weights to create an impactful, authoritative presence.
- **Body:** Inter provides maximum legibility for long-form data and interface descriptions, maintaining a neutral, professional tone.
- **Labels:** JetBrains Mono is used for small metadata, status tags, and "technical" micro-copy, reinforcing the professional/industrial narrative.

## Layout & Spacing

The design system utilizes a **fixed-grid** philosophy for desktop to maintain structural integrity, transitioning to a fluid model for mobile.

- **Grid:** A 12-column system with generous 24px gutters to allow the deep slate surfaces to "breathe."
- **Rhythm:** All vertical spacing must be a multiple of the 8px base unit.
- **Mobile:** Margins shrink to 20px, and complex multi-column layouts must reflow into a single-column vertical stack.

## Elevation & Depth

Depth is achieved through **Tonal Layering** rather than traditional shadows. In a dark slate environment, shadows are less effective, so the system uses lighter surface tints to indicate "height."

- **Level 0 (Base):** #0F172A (The canvas).
- **Level 1 (Cards):** #1E293B (The primary container).
- **Level 2 (Modals/Popovers):** #334155 (The highest surface).
- **Accents:** High-contrast yellow outlines (1px) are used sparingly to indicate active focus or primary selection, replacing the need for heavy drop shadows.

## Shapes

The shape language is **Soft (0.25rem)**. This slight rounding takes the "edge" off the industrial aesthetic, making the professional environment feel modern and considered rather than aggressive.

Buttons and input fields use the base 4px (0.25rem) radius, while larger containers like cards may use 8px (0.5rem) to soften the overall composition.

## Components

Consistent styling across the component library ensures the high-contrast yellow remains an effective tool for navigation.

- **Buttons:** Primary buttons are solid Yellow (#FACC15) with Black (#000000) text for maximum contrast. Secondary buttons are outlined in Slate (#94A3B8).
- **Inputs:** Dark slate backgrounds (#1E293B) with a 1px slate border. Upon focus, the border transitions to Primary Yellow.
- **Chips:** Use JetBrains Mono for text. Active chips utilize a subtle yellow tint (10% opacity) with a solid yellow border.
- **Lists:** Items are separated by subtle 1px dividers in #334155. Hover states should use a slight brightness increase of the surface color.
- **Cards:** No borders; use tonal elevation (Level 1) to distinguish from the background.
- **Status Indicators:** Use the primary yellow for "Warning" or "Active," but introduce a muted red for errors to maintain safety conventions within the slate theme.
