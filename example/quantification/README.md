# p-Akt (S473) reconstruction

This is a computational reconstruction of the finalized 2026-09-26 rules using the current tutorial aggregate and endpoint engines. It is not a reconstruction of the earlier background-subtracted slide 34, and not a new review at the 75% default. No original project data or annotations were changed.

## What was recomputed

25 Well 1 ROIs, five per condition; 13,542 frozen neuronal identities. Only p-Akt S473 is quantified/plotted. The 14-marker cutoff set is needed for the global rule (>10 small-component hot pixels in at least four markers). The current Chapter 3 engine recomputed components, small-hot counts and full-mask proximity; no old exclusion flags or corrected means were used as inputs. The original p-Akt TIFF plane 13 matched every prepared quantitative pixel across all 25 ROIs. Five ROIs also match the tutorial example exactly, including labels and population flags.

Cell-exclusion order: area <120 µm²; cross-marker small-hot burden; current-marker small-hot count >10; full-mask edge gap <10 µm to a large (≥20-pixel) hot component; adopted spread overlap >20% of original mask area; no remaining pixels. Exactly 120 µm², 10 small-hot pixels, 10 µm, and 20% spread overlap pass their respective boundaries. Hot pixels use I ≥ 5 and 8-connectivity. No background subtraction, cell-intensity trimming or normalization. Plot transform: arcsinh(mean of retained raw pixels / 5).

The three adopted historical p-Akt spread masks contain 649, 374 and 160 pixels. Their automatic/manual unions were reproduced exactly by the current endpoint engine using the saved crop geometry, settings and drawings. Their source SHA and coordinates are recorded. Two are manual-only. An unreviewed nLnK_1_04 aggregate and a linked B_1_02 aggregate add no new mask; this is a documented review limitation, not a clean-pixel assertion. The nLnK crop was visually inspected again: the deposit sits close to the left ROI edge, with weaker nearby signal and tissue context; further mask review is warranted. A separate visually chosen reference proposal is included as `provisional_tutorial_review_backup.json` (decision remains unreviewed) and `provisional_reference.png`. It yields 74 candidate pixels at bright 3.75 and 255 at bright 2; neither candidate overlaps retained cells. These checks do not establish a final mask, and neither is adopted in the reconstruction. No new estimated mask was silently added.

## Result and limits

7,440 cells retained, matching the saved final audit in every cell identity, exclusion reason and numerical measurement (tolerance 1e-12). First-failure exclusions: 6,088 size, 2 cross-marker burden, 10 large-component proximity, 2 spread overlap. There are no additional first-failure current-marker small-hot or zero-denominator exclusions. In retained cells, 1,298 pixels were removed once from numerator and denominator, changing 940 means; spread adds a change beyond hot removal in two retained cells. The original masks and remaining zero-intensity pixels are preserved.

The main before/after figure compares different populations and explicitly different full-range y scales. The companion figure fixes the same 7,440 identities, uses shared scales and labels the 12 values above its detailed 0–0.15 view. Each dot is one cell; no significance tests are supplied. Five ROIs from this well are not five independent biological experiments. Reproducing a result verifies computation on these frozen inputs; it does not independently establish segmentation accuracy, artifact identity or biological validity.

## Reproduce

Download and extract the separate full-input package linked from the tutorial. The five-ROI teaching download alone cannot recreate a 25-ROI plot. The reconstruction package contains a `prepared/` catalog with exact float64 marker arrays and uint32 cell labels, the configuration, the explicitly adopted spread-mask union, the current aggregate engine and the quantification/plotting code. Images for all 14 required markers are included only for the cross-marker rule.

From the extracted `pAkt_S473_reconstruction/` directory (Node.js 18+):

    node code/verify_frozen_spread.cjs spread_inputs
    node code/quantify_marker.cjs prepared/catalog.json quantification_config.json frozen_spread_masks.json results_new
    python -m pip install -r requirements_plot.txt
    python code/plot_quantification_example.py results_new/cell_audit.csv figures_new

Use a new output directory. To redraw only the published plot from its computed table, run the plotting command on `results/cell_audit.csv`. The CSVs, run manifest, validation report, frozen mask inventory and figure statistics are included. `quantify_marker.cjs` expects an explicit `imc-quantification-spread-union` input; it does not automatically promote arbitrary Chapter 4 candidate masks to accepted exclusions. A general Chapter 4-to-quantification export interface is still to be built.

## Attribution

Yang Cheng, University of Virginia, Christopher Deppmann and Melanie Worley laboratories. Technical assistance, mentoring and materials: Eli Zunder laboratory. ChatGPT (OpenAI): implementation, documentation and computational validation assistance.

The reviewed-mask union must contain `hot_cutoff` with the same `value` and `operator` as the quantified marker. Changing the cutoff requires reviewing the spread masks again. Quantification rejects inconsistent calibration/area metadata. If every included cell is excluded, it writes the full audit and a header-only retained-cell CSV; the demonstration violin script requires retained cells in all five example conditions.
