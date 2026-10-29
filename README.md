# IMC hot pixel inspection & noise exclusion

Version 0.1.0 · Interactive inspection and reproducible quantification example

**Author and pipeline lead:** Yang Cheng, University of Virginia (UVA), Christopher Deppmann and Melanie Worley laboratories.

**Acknowledgments:** Substantial technical assistance, mentoring, and materials from Eli Zunder’s laboratory.

**Development contributor:** ChatGPT (OpenAI), contributing to code, interface development, documentation, and tutorial construction.

**This release includes:** prepare quantitative images and aligned cell labels, then inspect outlying cells, pixel-intensity bins and signal contributions before recording marker-specific hot-pixel decisions. Chapter 3 provides connected hot-pixel aggregate inspection, full-mask gap measurements, configurable cell flags and review/audit exports. Chapter 4 adds guided noise-spread review. A reproducible p-Akt quantification command and worked result are included; general interactive final quantification remains planned.

## Start here

[Read the illustrated tutorial](https://cheng-mcnsci.github.io/IMC-Hot-Pixel-Inspection-and-Noise-Exclusion/) · [Open the cell reviewer](https://cheng-mcnsci.github.io/IMC-Hot-Pixel-Inspection-and-Noise-Exclusion/example/review/) · [Browse the source](https://github.com/Cheng-MCNsci/IMC-Hot-Pixel-Inspection-and-Noise-Exclusion/tree/main/code)

[Download the complete tutorial, code and five-ROI example](https://github.com/Cheng-MCNsci/IMC-Hot-Pixel-Inspection-and-Noise-Exclusion/releases/download/v0.1.0/IMC_Hot_Pixel_Inspection_Tutorial.zip). Extract the ZIP into a new folder and keep its folders together. The hosted example works directly in a desktop browser; for your downloaded copy, follow the commands below.

The [separate full p-Akt reconstruction package](https://github.com/Cheng-MCNsci/IMC-Hot-Pixel-Inspection-and-Noise-Exclusion/releases/download/v0.1.0/pAkt_S473_reconstruction_inputs.zip) contains all 25 ROIs and the 14-channel arrays needed to reproduce the cross-marker exclusion rule. It is larger than the five-ROI teaching example.


With Python 3.10 or newer available, run from this folder:

```bash
python serve.py
```

Open the printed local address, normally `http://127.0.0.1:8788/`. On macOS, `Open_tutorial.command` is a shortcut if `python3` is installed. The illustrated guide also opens directly as `index.html`, but its reviewer requires the local server. The local preview server disables HTTP caching, and the viewer links scripts/styles by content version to avoid mixing old code with a new layout. Saved review records remain in browser storage. The prepared example uses only Python's standard library for serving; no NumPy install is needed to explore it. Use a desktop browser supporting `DecompressionStream` (e.g. an installed recent Chrome/Edge/Firefox/Safari); no CDN, account or API key is used.

Keep the terminal open. Stop with Ctrl+C. If the port is occupied, use `python serve.py --port 8789`; browser storage belongs to the address, so export before changing it.

Online and local copies have separate browser storage. Export review JSON before changing addresses; import it into the matching dataset to continue. The tutorial processes example images and review edits in your browser. Exported files, rather than browser storage alone, are the portable record.

## Use your own data

Read Chapter 1 in `index.html` first. Copy `templates/` into a new folder `my_inputs/`, edit its metadata and use paths relative to `my_inputs/dataset.json`. Do not run the placeholder files without replacing them. For all cells, leave `cells` null. For a selected population, set it to `cell_metadata.csv` and provide every positive mask label with an explicit true/false flag.

Create a measurement environment:

```bash
python -m venv .venv
```

Activate with `source .venv/bin/activate` on macOS/Linux, `.venv\Scripts\Activate.ps1` in Windows PowerShell, or `.venv\Scripts\activate.bat` in Windows Command Prompt. Then:

```bash
python -m pip install -r requirements.txt
python code/prepare_dataset.py my_inputs/dataset.json --output results/my_review
python serve.py
```

Open `/results/my_review/` at the printed local address. Existing output directories are refused; use a new name for a new input version. Numerical validation cannot verify orientation, correct marker mapping, segmentation quality or biology; inspect the images and masks. New segmentation or extraction is outside these chapters. No MCD, neuron classifier, Pixie, DeepCell, original project folder structure or prior cell-intensity table is required.

For the bundled example, reproduce preparation into a new directory:

```bash
python code/prepare_dataset.py example/dataset.json --output results/reproduced_example
```

`Guided_Inspection.ipynb` provides the same input and pixel-accounting lesson in notebook form. Install Jupyter separately if using it; it is optional. Use the browser for human annotation.

## What is included

- `index.html`, `guide.css`, `assets/`: illustrated Chapters 1–4, input checklist, decision workflow and real-image examples.
- `code/prepare_dataset.py`: reusable TIFF/CSV loader, input validation, initial measurements and browser-asset generation.
- `interface/`: reusable review frontend copied into every new prepared dataset. Changes here take effect when a new dataset is prepared.
- `templates/`: editable configuration, ROI/channel tables and optional population-table structure.
- `example/images/`, `example/masks/`: five full-resolution ROIs, unchanged selected quantitative channels and unchanged labels, losslessly compressed TIFFs.
- `example/dataset.json`, `rois.csv`, `channels.csv`, `cell_metadata.csv`, `source_provenance.json`: portable example inputs and source traceability.
- `example/review/`: ready-to-serve images, measurements, catalog, provenance and validation report.
- `code/build_example.py`: maintainer-only adapter for the original local project. Ordinary users do not need it or the original Desktop paths.
- `validation/`: recorded checks of input adaptation, measurements, browser behavior and source equality.

## Interpretation and provenance

The example uses mass cultures of wild-type (WT) rat sympathetic neurons. DIV means days in vitro; DIV4.5–DIV5 spans 12 hours. NGF = nerve growth factor; BDNF = brain-derived neurotrophic factor; KCl = potassium chloride.

| Condition label | Experimental condition |
| --- | --- |
| CoN | Continuous NGF through DIV5. |
| nLnK | Trophic factor deprivation without KCl for 12 hours, DIV4.5–DIV5; maintained with 50 ng/mL NGF before DIV4.5. |
| nLwK | Trophic factor deprivation with 12.5 mM KCl for 12 hours, DIV4.5–DIV5. |
| N / 30min N | 100 ng/mL NGF for 30 minutes after the 12-hour deprivation with 12.5 mM KCl. |
| B / 30min B | 200 ng/mL BDNF for 30 minutes after the 12-hour deprivation with 12.5 mM KCl. |

N and B are the ROI/file labels; the violin plots use 30min N and 30min B. These experimental details were supplied by Yang Cheng.

The teaching data are from the 8 September 2026 rat SCG IMC experiment. Five Well 1 ROIs represent CoN, nLnK, nLwK, N and B. They include 2,401 selected neuronal analysis regions. The example includes 15 inspection markers plus quantitative TH for context; cl. Casp3 was omitted in the later final signaling analysis, but this chapter applies no marker or cell exclusions.

Quantitative TIFFs came from Steinbock 0.16.3 extraction with HPF=50, no spillover correction and no normalization. “Raw” here means those quantitative input values, not unfiltered instrument counts. Selected channels are preserved without scaling, cropping or intensity changes. `original_panel_index` retains the zero-based original 57-channel mapping; `channel_index` is the zero-based plane in the redistributed 16-channel stack.

Masks are documented as user-validated whole-cell analysis regions with unchanged nuclear-origin labels. They are teaching analysis regions, not a claim of membrane-defined whole-cell segmentation. Images, masks, population IDs and calibration must remain paired.

The viewer follows the original All Marker neuronal-review layout: shared controls above a scrolling four-panel gallery, three separate bin inputs, bin comparison, synchronized zoom/pan, a brightest-pixel locator, and assessments beneath each cell. Yellow highlights the cell being reviewed. **Show all cell outlines in crop** (enabled by default) adds cyan contours for other included cells and magenta contours for cells outside the review population. In the teaching example these are neighboring neurons and non-neuronal cells, respectively. Other datasets use their supplied include flags; these colors are not a cell-type prediction. Turn the option off to isolate the reviewed cell. **High visibility** traces its mask boundary in solid yellow with a dark contrast border. **Original · subtle** restores the one-native-pixel, 50%-opacity style. These are display overlays; the measurement mask stays unchanged. Pink/magenta bin fills represent the highest intensity range; distinguish those filled pixels from magenta context outlines. The teaching example selects neurons; other preparations follow their input population flags.

Display maximum, intensity bins, exploratory threshold and outline controls remain visible in the main controls. The two display shortcuts let you set independent original/review brightness values per marker. Additional options hold crop size and context brightness; context defaults to automatic contrast (set TH to 180 to reproduce the original experiment’s display). Crop, context brightness, zoom and pan apply to this viewing session.

Edits to cell assessments and notes autosave when leaving the field, or through **Save review**. Viewing alone does not create a review. Reviews retain their intensity settings, and existing tutorial v1 review exports/browser records remain compatible. **Export all markers** includes every marker; **Export selected marker** limits the backup to the current marker. Import merges whichever matching markers and reviews are present, keeping newer records.

Browser settings start blank. Review lists are screening aids, not statistically defined outlier exclusions. The accepted working cutoff and comparison operator are explicit and separate from display maximum, bins and exploratory threshold. High intensity alone does not establish artifact identity; signal below the cutoff can still contain spread/background. Neither viewing nor recording a cutoff changes measurements in these chapters.

Population provenance: the original upstream neuron-assignment table has changed since development. This example therefore uses the population flags and full label images preserved inside the completed All Marker aggregate-inspection package. All selected marker planes were checked against the original neuronal-review hashes. It reproduces the original 2,401-cell five-ROI review set.

Export review JSON to preserve settings and assessments. The new tutorial has its own dataset identity and browser-storage keys and never imports or modifies the original production annotations.

## Distribution status

Version 0.1.0 distributes the tutorial, reusable code, five-ROI teaching data and a separate frozen-input p-Akt reconstruction. General interactive final quantification remains planned. A reuse license has not yet been selected; contact the author for permission beyond applicable GitHub terms. Third-party software retains its own licenses.

## Chapter 3: aggregate inspection

Open `example/review/aggregates.html` from the running tutorial, or `results/my_review/aggregates.html` for your preparation. Both viewers use the same catalog and raw arrays; no extra source files or Python packages are required. The preparation script copies the five aggregate interface files automatically.

Use saved Chapter 2 cutoffs or import its matching JSON export. A positive cutoff and explicit `>=` or `>` operator are required; bins and display maximum do not define hot pixels. The example-only button loads the historical 14-marker cutoff set, excluding cl. Casp3 and TH; p-ATM uses 100 (the later historical value). These are exploratory presets, not universal thresholds. Chapter 2 decisions are never overwritten.

The original aggregate-style overview and four-panel scrolling gallery now use arbitrary prepared marker sets and calibrated X/Y pixels. Components are 8-connected across the complete ROI. The gallery minimum and nearby-table radius do not change the small/large classification or cell flags. Full original masks, including cells outside the review population, remain visible. Notes autosave per marker/ROI/cutoff/operator/component anchor; exports include all cutoff versions.

Adjust original example defaults in Analysis rules: large component ≥20 pixels, full cell area <120 µm², small-component burden >10 pixels, burden in ≥4 required markers, and full-mask edge gap <10 µm to large components. Remaining-pixel count zero also flags the cell. Missing required cutoffs yield an explicit pending assessment and lower-bound cross-marker counts. Flags apply only to included cells; these are inspection records, not deletion or corrected intensity calculations.

Export review JSON for settings/notes, and current ROI cell-flag audit JSON for all original cells, including completeness, cutoffs and rules. Import merges newer notes and restores settings/shared rules from a newer backup. Keep the prepared arrays too. Gallery colors: cyan aggregate, yellow included/no computed flag, purple size/count/no-pixels flag, green large-component proximity, magenta outside population. Pending checks are always shown separately.

Numerical engine checks: `node code/test_aggregate_engine.cjs`. Independent real-data comparison and browser checks are recorded in `validation/aggregate_checks.json`.

## Chapter 4: noise-spread review

Open `example/review/spread.html`, or follow an aggregate row’s Inspect noise spread link. The same prepared arrays are used; no new background/biological mask or CSV is required. New preparations copy all five `spread.*`/`spread_*` files. Import matching Chapter 2/3 decisions to carry cutoffs across browsers.

**The adjustable bright-pixel starting threshold is 75% of the hot-core cutoff.** It counts I ≥ threshold in reference patches and radial bands. It does not redefine the hot core or threshold individual spread pixels. Saved reviews retain their applied settings.

Draw a comparison region, including its actual cells and zeros, then examine 16 directional profiles. A near-core bright-fraction excess seeds a candidate. Two consecutive adequately sampled bands within the reference interval can establish an endpoint if their pooled bright fraction is lower and no later pair of excess bands contradicts it. All acquired non-core pixels before that endpoint enter the candidate area. Nonzero density is supporting information only. Missing reference and unresolved directions stay explicit.

Default geometry: 5 µm rings, 60 µm search, 10 µm initial distance. Reference: 10 µm patches, ≥10 pixels each, ≥8 patches, central 90% range +5 percentage points. Ring/wedge eligibility: ≥15 acquired pixels and ≥50% acquired coverage. Geometry supports unequal X/Y calibration and sparse uint32 labels. Distances run from sampled pixel centers to core-pixel edges. The reference patch grid is crop-relative, so changing search radius can shift it; drawings and manual pixels remain fixed in ROI coordinates.

Manual wedge/ring additions, review decisions and notes are saved per dataset/marker/ROI/cutoff/operator/component anchor. Analysis edits reset review acceptance. Exports separate automatic/manual/combined candidates, accepted areas, unresolved directions and core pixels. Coordinates are zero-based full-ROI flat indices. All-saved export recalculates saved entries only, not the entire dataset; skipped, cancelled and failed states are explicit. Final quantification is not performed here.

Two real teaching figures show signal left when only the selected hot core is hidden. Orange overlays are frozen historical automatic candidates plus manual selections, not ground truth or outputs of the new 75% default. The p-Tyr example (N_1_02, aggregate 2) shows fan-shaped spread below the core; all 1,002 historical spread-area pixels are below its hot cutoff of 25. Its historical bright threshold was 7, versus the new default 18.75; this illustrates why the default needs review and adjustment. The p-Akt S473 example is retained. Rebuild figures with `python code/build_spread_figures.py` after installing Matplotlib separately. Metadata and metrics are in `assets/spread_teaching_cases.json` and `assets/spread_teaching_metrics.json`.

## p-Akt S473 reconstruction example

A one-marker quantification example now recomputes all 25 Well 1 ROIs with the current aggregate engine and adopted historical spread masks. It retains 7,440/13,542 cells and matches the finalized audit in every record. See `example/quantification/README.md` for scope, review gaps, exclusions, data/code downloads and reproduction. The general interactive final-quantification workflow is still planned.

## Summarized pipeline logistics

The tutorial navigation includes a workflow overview immediately before Troubleshooting (`index.html#pipeline-logistics`). Its six-step chart distinguishes original cell masks, hot-pixel masks and adopted noise spread masks; direct dependencies show cell area, per-cell counts, distances and pixel-removal inputs. A brief change-impact table explains what must be repeated after a cutoff, reference, calibration or cell-size rule changes. Definitions distinguish the aggregate gallery minimum from the large-aggregate analysis boundary.
