# Printing design

Dedicated invoice, prescription, comprehensive, customer statement, purchase and return documents consume domain snapshots. PrescriptionView is shared for compact/full/print modes with OD then OS, SPH/CYL/AXIS/ADD/PD, IPD, exam date and notes. Unknown values display an em dash, not zero.

Electron creates an isolated document window for preview/printing/PDF. Store branding, currency, language, paper size, margins, copies and visibility options come from settings. Printer names are selected from Electron enumeration; file destinations use native dialogs. Documents never include application chrome. RTL uses logical alignment while numeric optical fields remain LTR.
