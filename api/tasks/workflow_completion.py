from loguru import logger
from pipecat.utils.run_context import set_current_run_id

from api.services.workflow_run_billing import (
    report_completed_workflow_run_platform_usage,
)
from api.tasks.run_integrations import run_integrations_post_workflow_run


async def process_workflow_completion(
    _ctx,
    workflow_run_id: int,
):
    """Process workflow completion: run integrations and report billing.

    Recording/transcript uploads happen in the pipeline process itself
    (api/services/workflow_run_artifacts.py) before this job is enqueued,
    so this task needs no shared filesystem with the web tier.

    Args:
        _ctx: ARQ context (unused)
        workflow_run_id: The workflow run ID
    """
    run_id = str(workflow_run_id)
    set_current_run_id(run_id)

    logger.info(f"Processing workflow completion for run {workflow_run_id}")

    # Run integrations including QA analysis (after uploads are complete)
    try:
        await run_integrations_post_workflow_run(_ctx, workflow_run_id)
    except Exception as e:
        logger.error(f"Error running integrations for workflow {workflow_run_id}: {e}")

    # Notify MPS after completion. MPS owns credit accounting.
    try:
        await report_completed_workflow_run_platform_usage(workflow_run_id)
    except Exception as e:
        logger.error(
            f"Error reporting platform usage for workflow {workflow_run_id}: {e}"
        )

    # Sync call and caller/callee contact to CRM timeline. Never raise —
    # CRM sync must not fail completion processing, but log full context.
    try:
        from api.db import db_client

        contact_id = await db_client.sync_workflow_run_to_timeline(workflow_run_id)
        if contact_id is not None:
            logger.info(
                f"Synced workflow run {workflow_run_id} to CRM timeline "
                f"(contact_id={contact_id})"
            )
    except Exception as e:
        logger.error(
            f"Failed to sync workflow run {workflow_run_id} to CRM timeline: {e}"
        )

    logger.info(f"Completed workflow completion processing for run {workflow_run_id}")
