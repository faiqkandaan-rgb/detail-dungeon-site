DETAIL DUNGEON  -  concept website
==================================

Open index.html in a browser, or upload this whole folder to any static host
(Netlify, Vercel, cPanel public_html). Everything is relative, no build step.

What is in here
  index.html            the whole site
  3d/                   the real-time 3D configurator
    configurator.js     three.js scene: bay lighting, PBR finishes, blackout, orbit
    car.glb             the car model (Draco compressed, 1.6 MB)
    car.b64.txt         the same model as text, used only on hosts that refuse .glb
    car_ao.png          baked contact shadow
    draco/              the Draco decoder, served from the site so no CSP issues
  svc/                  before/after pairs for the service cards
  cov/  cc/  img/  vid/ photos, coverage diagrams, image-recolour fallback, reels
  fonts/                self-hosted copies of the web fonts (optional)

How the 3D section works
  One car, one light rig. Colour and finish are material parameters
  (roughness, clearcoat, metalness), the same way Avery Dennison's
  configurator does it. three.js 0.169 loads from jsdelivr via the import map
  in <head>. If WebGL is missing or the model fails, the section falls back to
  the image-based recolour automatically.

Swapping the car
  Replace 3d/car.glb with any glTF. Node names drive materials: a mesh called
  "body" takes the paint, "glass" the glass, "chrome" / "trim" the brightwork,
  "rim_*" the wheels, "tire" the rubber. For per-panel PPF packages, export the
  body as separate meshes (hood, roof, doors, fenders, bumpers) and they can be
  highlighted individually.

3D files
  3d/lc300.glb and 3d/slk-cabin.glb are the real models (Draco). The .b64.txt
  twins exist only because the preview host refuses .glb; the loaders try the
  .glb first, so on a normal host you can delete the .b64.txt files.
  3d/configurator.js  colour change (section #colour)
  3d/coverage.js      PPF packages, panel by panel (section #coverage)
  3d/trim.js          interior trim film on the SLK cabin (section #interior)
  3d/hero.js          source of the hero film; vid/hero.mp4/.webm were rendered
                      from it (node shoothero3d.js in the build folder).

Hero film environment
  vid/hero.* was rendered from 3d/hero.js in CITY mode: the sky and sun come
  from a photographed HDR (env/flower_road_2k.hdr, Poly Haven via Google
  Filament, CC0) and the avenue (towers, trees, crossing, shopfronts) is built
  in code and slides past the car; reflections are re-baked from the car every
  frame. env/ is not needed by the published site, only to re-render. The
  exact render command (build folder):
    HQ="hdr=env/flower_road_2k.hdr&city=1&yaw=-1.934&hx=1&el=27&exp=0.6&sm=3072" \
      node shoothero3d.js "<json list of 588 times, i/24>" <frames dir>
    bash encode_hero.sh <frames dir> site/vid hero      (24 fps in the script)
  Parameters: yaw rotates the sky so the sun sits up-right of the closing
  camera, el lowers the sun used for shadows and flare (degrees), exp is the
  exposure, sm the shadow map size. Plain HDRI mode (a photo projected on the
  ground, no city) is still there: drop city=1 and pass hh=<camera height>.

Model licences
  Land Cruiser 300 (3d/lc300.*): "2022 Toyota Land Cruiser 300 VX.R" by Ddiaz
  Design, Sketchfab, CC BY-NC-SA 4.0. Credit line is in the footer and must
  stay. NONCOMMERCIAL licence: fine for this concept and client review, not
  for the live commercial site. Swap for a purchased model (same node naming
  works: SK_Hood, SK_Door_*, SM_Bumper_*, SM_Fender_*, SM_Roof, SK_Trunk,
  SM_SideMirror_*, paint material containing 1350010001) or buy a commercial
  licence from the author before launch.
  SLK 55 AMG cabin (3d/slk-cabin.*): "Mercedes-Benz SLK 55 AMG (2012)" by
  geyges, Sketchfab Standard licence (commercial use allowed). Exterior,
  wheels and roof are stripped; only the cabin ships.
  The Ferrari 458 placeholder from the three.js examples is no longer used.

Colours
  Edit the FINISH array in index.html (search for "const FINISH"). Each swatch
  is [name, hex] with an optional 1 for metallic.

Leads (WhatsApp + sheet)
  backend/README-leads.txt has the 10-minute setup. The site posts quote-tool
  leads to a Google Apps Script endpoint (backend/leads-apps-script.gs) that
  appends rows to a Google Sheet; until DD_CFG.leads is set in index.html the
  form falls back to WhatsApp with the same details. Studio number is
  DD_CFG.whatsapp.

Removed on client request (Oct 21)
  The 3D process film, the Audi e-tron four-stage scroll and the "recent work"
  reels. Their assets are out of the build; the sections can come back from an
  earlier zip if wanted.

Still to add
  Basic and Gold PPF prices in the quote tool (currently "quoted on inspection").
