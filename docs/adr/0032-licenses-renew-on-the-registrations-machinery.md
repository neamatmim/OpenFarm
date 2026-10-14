# Licenses renew on the Registration's machinery; the Vet's BVC number and the Restore Drill are written down

Date: 2026-10-14

The flow survey of 2026-10-13 (G7) found three things the farm does with no place in the app. A farm in Bangladesh holds
papers beside its DLS Registration — the trade license from the Union Parishad, the municipality or the city
corporation above all, renewed every year — and nothing said when one ran out. The Vet's Bangladesh Veterinary Council
number, which an inspector and a slaughter vet read beside the name of whoever prescribed, was nowhere. And the
quarterly Restore Drill the runbook asks for was written in an ops log nobody opens. The Owner delegated the open
choices: decide on the recommendation and record why.

## Decision

- **A License** is one of the Farm's papers from an authority other than the DLS: its kind — `trade`, `environment`
  (the Department of Environment's clearance), `fire` (the Fire Service and Civil Defence's), or `other`, which the farm
  names — its number, who issued it, the days it runs between, and its certificate's photographs. Written and put
  right by the Owner or the Manager, read by the Vet, as the Registration is; retired, never deleted. One that does not
  run out is written with no expiry and is never renewed. A Manager's change is told to the Owner, as a change to the
  Farm Identity is. Retired, its open renewal work is called off (`license_retired`), and no renewal — a correction of
  one already done among them — renews a License the farm no longer holds (`renewal_names_no_license`).
- **Renewed on the Registration's machinery, generalized rather than copied.** What makes a renewal a renewal —
  refused without a photograph of the renewed certificate, refused to a day before the expiry it replaces, keyed on the
  Completion so a correction puts the same renewal right, standing aside once the paper has moved on — is now one
  function, `renewPaper`, over a `RenewablePaper` that says where a paper keeps its expiry, its renewals and its
  certificates. The Registration is one; each License is another. So is the raising: `renewalSlotsFor` takes the paper
  coming due — the Trigger that renews it, its expiry, the renewal lead, the cause its work is raised under, and the
  procedures whose work for it stands open — and the Day Turning asks it of the Registration and of each License.
  An expiry put right by hand while the renewal work is open moves that work with it, for either paper
  (`followTheExpiry`): due the day the paper now runs out, under that expiry's cause, so it is not late on a day the
  paper no longer runs out and the next turn finds it already raised.
- **Its own Trigger and Step Effect, `license_renewal`**, not the Registration's stretched. The Registration's renewal
  is an errand to the Upazila Livestock Office; a trade license's is to the Pourashava. A farm that wants different
  steps for them writes two procedures, and one that renews licenses at all writes one more. The work carries which
  License it is for in its cause, `license:<id>:<day it runs out>`, raised once for each License and each certificate,
  in no Pen, the Owner's, due the day it runs out. The Playbook refuses a procedure raised by both renewal Triggers, a
  License's renewal work that renews the Registration, and a License-renewing Step nothing but a License coming due
  raises. Renewing a License is the Owner's, as renewing the Registration is (`owner_only`).
- **One renewal lead for every paper**: the farm's Registration renewal lead (ninety days unless the Manager says
  otherwise). A second Farm Parameter for Licenses would be a number to keep in step with the first for no gain; the
  trade license's fiscal-year renewal falls well inside it.
- **Told and listed as the Registration is.** A License's renewal raised is told to the Owner in the evening's post
  (`license_renewal_due`), and each License within its lead or run out stands on the Owner's home beside the
  Registration, opening its renewal work once raised and the farm page until then.
- **The Vet's BVC number is on the Vet's Role**, not the Account: the Account is how somebody signs in, and the number is
  what the farm keeps about its Vet (`role_assignment.bvc_number`). The Vet writes their own in Settings; the Owner or
  the Manager writes it on the Vet's page from the council's certificate; anybody else's is refused (`bvc_is_a_vets`).
  It is kept when the Role is revoked, because the papers that Vet signed still name it.
- **Printed beside the Vet's name** wherever a paper names the Vet who prescribed or diagnosed: the treatment register
  — and a column `prescriber_bvc_number` after the DLS template's columns in its CSV, so a sheet laid out on the
  template still reads them where it did — the disease history, an animal's passport and withdrawal summary, and the
  letter to the Upazila Livestock Officer. As the certificate prints it, in either language: «ডা. করিম (বিভিসি নং
  BVC-0457)», «ডা. করিম (BVC no. BVC-0457)».
- **A Restore Drill is written down on the Backups page**: the day it was done, whether it went well, which copy was
  restored, a note — which one that went badly must have — who did it, the Owner or a Manager between whom it is done
  (the one writing it down unless they name the other; anybody else is refused, `drill_done_by_who_runs_the_farm`),
  and who wrote it down. Never edited; written wrong, it is written again and the one written last stands, though it
  puts the drill on an earlier day than the one it corrects. The next is due a quarter after
  the last, whether or not it went well, since the next drill is what checks the mend; a farm that has never drilled is
  counted from its first good copy, and one with no good copy is asked nothing here, its backups being the louder
  problem. Overdue the day after it falls due.
- **Overdue is told where a backup failure is**: the Owner's notices, raised by the server's own timer
  (`restore_drill_overdue`), once for each quarter missed, settled by the sweep once a drill is written down — in the
  evening's post rather than at once, since a drill is an afternoon planned, not a fire.

## Consequences

- Two new tables of renewals and certificates for Licenses beside the Registration's own, rather than one shared table
  with a column saying whose: every read of the Registration's certificate would otherwise have to remember to leave
  the Licenses out, and the one that forgot would show an inspector the trade license.
- A farm sees no License's renewal work until the Owner writes a procedure raised by `license_renewal`, as with the
  Registration — the standard Playbook carries neither. The farm page says so plainly, with the way to the Playbook,
  for the Licenses and for the Registration alike; the Owner's home lists a paper coming due all the same.
- The Inspector View lists the Licenses the farm holds beside the Registration, each with its certificate, and its
  treatment register reads the prescribing Vet's BVC number on the screen as on the paper.
- The Restore Drill is written down in the live farm it rehearsed: the runbook's ops log line is now the Backups page.
  The mark left in the restored copy stays, as the copy's own proof that it was opened.
