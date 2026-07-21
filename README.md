# CesiumSlate.jl

An interactive **CesiumJS 3D globe with live satellites** as a first-class [Kaimon Slate](https://github.com/kahliburke/KaimonSlate.jl) output — return a `cesium_globe()` from a notebook cell and Slate mounts a draggable globe tracking real satellites (fetched from Celestrak, propagated with `satellite.js`).

```julia
using CesiumSlate
cesium_globe(satellites = "starlink", imagery = "dark")   # → an interactive globe, 140 live orbits
```

## What it demonstrates

CesiumSlate is a complete Slate **extension** that depends only on `SlateExtensionsBase` (the lean SDK) — **never on the KaimonSlate server**. The entire Julia side is three dispatch points:

```julia
module CesiumSlate
using SlateExtensionsBase                       # the ONLY dependency

struct CesiumGlobe; props::Dict{String,Any}; end
cesium_globe(; satellites="visual", imagery="dark", kw...) = CesiumGlobe(Dict("satellites"=>satellites, ...))

# 1. a returned value renders as a component (the same registry a @bind widget mounts through)
SlateExtensionsBase.slate_render(g::CesiumGlobe) = component("CesiumSlate.CesiumGlobe", g.props)

# 2. ship the front-end renderer once, on `using CesiumSlate`
__slate_frontend(slate_on) = provide_frontend!(@pkg_asset("assets/cesium.js"); id="CesiumSlate.cesium")
end
```

No boot cell, no per-cell asset plumbing, no server dependency — the front-end (`assets/cesium.js`) is a `slateRegisterWidget` component that CesiumJS mounts from the returned value's props.

## Layout

- `src/CesiumSlate.jl` — the extension (~40 lines).
- `assets/cesium.js` — the CesiumJS renderer (loads Cesium + satellite.js from CDN; token-free imagery).
- `notebooks/satellites.jl` — a two-cell demo.

## Notes

- **Token-free:** uses OpenStreetMap / CARTO base imagery, so no Cesium Ion account is needed. Drop in an Ion token for photorealistic terrain later.
- **Assets** load from a CDN today; a future `provide_assets!` vendors them for offline / reproducible exports.
