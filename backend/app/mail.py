"""Poll a dedicated IMAP folder, marking a message seen only after API acceptance."""
import os, time, email, imaplib, ssl, logging
from email.policy import default
import httpx

def poll():
    tls=ssl.create_default_context(cafile=os.getenv('IMAP_CA_FILE') or None)
    with imaplib.IMAP4(os.environ['IMAP_HOST'],int(os.getenv('IMAP_PORT','1143')),timeout=30) as conn:
        conn.starttls(tls)
        conn.login(os.environ['IMAP_USER'],os.environ['IMAP_PASSWORD'])
        conn.select(os.getenv('IMAP_FOLDER','INBOX'))
        status,items=conn.uid('search',None,'UNSEEN')
        if status!='OK': raise RuntimeError('IMAP search failed')
        for uid in items[0].split():
            status,raw=conn.uid('fetch',uid,'(BODY.PEEK[])')
            if status!='OK': continue
            msg=email.message_from_bytes(raw[0][1],policy=default)
            body=msg.get_body(preferencelist=('plain','html'))
            text=str(msg.get('Subject',''))+'\n'+(str(body.get_content()) if body else '')
            import hashlib
            eid=hashlib.sha256(raw[0][1]).hexdigest()
            r=httpx.post(os.environ['INGEST_URL'],headers={'X-Source-Key':os.environ['SOURCE_WEBHOOK_KEY']},json={'event_id':eid,'source':'approved-mailbox','kind':'email','text':text[:15000]},timeout=60)
            r.raise_for_status()
            conn.uid('store',uid,'+FLAGS','(\\Seen)')
if __name__=='__main__':
    while True:
        try: poll()
        except Exception as error: logging.warning('Mail poll failed: %s',type(error).__name__)
        time.sleep(int(os.getenv('IMAP_POLL_SECONDS','15')))
