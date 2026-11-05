# Implementation plan

1. Scaffold and configure the selected stack in place; preserve research; establish reproducible install and local environment setup.
2. Build shared contracts, database migrations, allowlisted authentication, and campaign/prospect APIs. Verify against real PostgreSQL and commit.
3. Add bounded public website extraction, durable jobs, evidence-aware Merge drafting and spend controls. Verify failure paths and commit.
4. Build the prospect workbench, campaign editor, split review, manual contact and follow-up flows; verify in a browser and commit.
5. Prepare VPS Docker topology, migration service, setup/runbook, integration checks, and final review. Commit the verified result.

No hosted services or real outbound messages are required for local verification. Missing Gateway credentials leave manual drafting available.
