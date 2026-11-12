from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

@workflow.defn
class Analyze:
    @workflow.run
    async def run(self,key:str):
        return await workflow.execute_activity('analyse_observation',key,start_to_close_timeout=timedelta(minutes=2),retry_policy=RetryPolicy(maximum_attempts=5))
