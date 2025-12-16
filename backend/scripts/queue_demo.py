import asyncio
from app.services.queue import create_task, QueueWorker

async def demo():
    task = await create_task('scan', items=[{'path': '.', 'media_type': 'movie'}], meta={'test': True})
    print('Created task', task.id)
    w = QueueWorker(poll_interval=0.1)
    # process one queued task
    processed = await w.process_one()
    print('Processed one:', processed)

if __name__ == '__main__':
    asyncio.run(demo())
