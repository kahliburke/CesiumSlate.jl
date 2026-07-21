"""
    CesiumSlate

A CesiumJS 3D globe as a first-class Slate **output component** — return a [`cesium_globe`](@ref) from a
cell and Slate mounts an interactive, satellite-tracking globe in the browser.

This is a complete Slate extension in ~40 lines of Julia, and it depends ONLY on `SlateExtensionsBase`
(the lean SDK), never on the KaimonSlate server. The whole extension is three dispatch points:

- `slate_render(::CesiumGlobe)` → a component descriptor — the value renders through the SAME registry a
  `@bind` widget mounts through, but for a RETURNED value (no `WebPage`, no boot cell).
- `__slate_frontend(slate_on)` → ships the front-end renderer (`assets/cesium.js`) once, package-globally,
  the first time a notebook does `using CesiumSlate`.
- (the renderer itself, `assets/cesium.js`, is a `slateRegisterWidget` component — CesiumJS owns a canvas,
  the self-owned-DOM case the SDK keeps the low-level hook for.)

The globe's configuration (which satellites, base imagery, orbit window) is passed as the descriptor's
`props`; the renderer fetches live TLEs from Celestrak and propagates the orbits with `satellite.js`, so a
notebook cell is just `cesium_globe()`.
"""
module CesiumSlate

using SlateExtensionsBase

export CesiumGlobe, cesium_globe

"""
    CesiumGlobe

A renderable CesiumJS globe. Return one from a cell (build it with [`cesium_globe`](@ref)) and Slate mounts
the interactive globe via `slate_render`. `props` is the JSON-safe config the front-end renderer reads.
"""
struct CesiumGlobe
    props::Dict{String,Any}
end

"""
    cesium_globe(; satellites="visual", imagery="dark", height=540, span_minutes=100, max=140) -> CesiumGlobe

An interactive 3D globe populated with LIVE satellites: the renderer fetches the Celestrak TLE `satellites`
group (e.g. `"visual"`, `"stations"`, `"starlink"`, `"gps-ops"`), propagates each orbit with `satellite.js`,
and animates them along glowing ground tracks. `imagery` is `"dark"` (a sleek CARTO dark basemap) or `"osm"`;
`span_minutes` is the orbit window sampled; `max` caps how many satellites are drawn.

```julia
using CesiumSlate
cesium_globe(satellites = "starlink", imagery = "dark")   # returns a CesiumGlobe → Slate renders it
```
"""
function cesium_globe(; satellites::AbstractString = "visual", imagery::AbstractString = "dark",
                      height::Integer = 540, span_minutes::Real = 100, max::Integer = 140)
    return CesiumGlobe(Dict{String,Any}(
        "satellites" => String(satellites),
        "imagery"    => String(imagery),
        "height"     => Int(height),
        "spanSec"    => round(Int, span_minutes * 60),
        "max"        => Int(max),
    ))
end

# The value renders as the `CesiumSlate.CesiumGlobe` component, its config carried as the descriptor props.
SlateExtensionsBase.slate_render(g::CesiumGlobe) = component("CesiumSlate.CesiumGlobe", g.props)

# The Cesium renderer loads ONCE, package-globally, from `using CesiumSlate` — no per-cell asset, no boot
# cell. (`slate_on` is unused: the globe drives itself in the browser, with no JS→Julia handlers.)
function __slate_frontend(slate_on)
    provide_frontend!(@pkg_asset("assets/cesium.js"); id = "CesiumSlate.cesium")
end

end # module
