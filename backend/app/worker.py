import asyncio,json,os
from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker
from .main import app
from .live import process
from .services import read_evidence
from .workflow import Analyze

@activity.defn
async def analyse_observation(key:str):
    return await asyncio.to_thread(lambda:process(json.loads(read_evidence(key))))

async def main():
    client=await Client.connect(os.environ['TEMPORAL_ADDRESS'],namespace=os.getenv('TEMPORAL_NAMESPACE','default'))
    await Worker(client,task_queue=os.getenv('TEMPORAL_TASK_QUEUE','sentinel_events'),max_concurrent_activities=int(os.getenv('WORKER_ACTIVITY_CONCURRENCY','1')),workflows=[Analyze],activities=[analyse_observation]).run()
if __name__=='__main__': asyncio.run(main())
