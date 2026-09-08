# Compact desktop community shell

Desktop community routes adapt to the actual shell container width at 900px, independently of the existing `/m` mobile app routes. Resizing changes CSS presentation only: the same navigation, main surface, editors, and chat composers remain mounted.

The compact navigation disclosure shows the existing community rail and community navigation in place of content. Closing it returns to that content; selecting a destination closes it automatically. Escape returns focus to its trigger. This is a navigation disclosure, not another router or a modal with a second navigation tree.

Chat shows one pane at a time in compact presentation. Community details are explicitly expanded; profile, memory, and thread drawers use the available content width and retain their existing back controls. Workflow board overflow stays owned by the existing board scroller.

Desktop widths above 900px retain the existing multi-column layout. Backend authorization, member state, forms, and workflow behavior are unchanged. Retired: the 56px icon-only desktop navigation squeeze and its hidden-label rules.

Acceptance: inspect Chat, Resources, and Workflows at 390/768/1280px in both themes; verify navigation, details, thread back, form reachability, draft continuity across resize, and no page-wide horizontal overflow. Staging only.
