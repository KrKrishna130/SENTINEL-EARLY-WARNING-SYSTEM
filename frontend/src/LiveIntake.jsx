import React, { useState } from "react";

export default function LiveIntake({api,refresh}) {
  const [kind,setKind]=useState("report");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  async function submit(e) {
    e.preventDefault();
    const values=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const observation={...values,kind,event_id:Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"),source:"operator-console",simulated:values.simulated==="on",confirmed:values.confirmed==="on",restricted_zone:values.restricted_zone==="on",dwell_seconds:Number(values.dwell_seconds||0)};
      let result=await api("/live/report","POST",observation);
      if(result.workflow) {
        setStatus("Queued for analysis. Waiting for the worker…");
        for(let i=0;i<90;i++){
          await new Promise(resolve=>setTimeout(resolve,2000));
          result=await api("/live/jobs/"+result.workflow);
          if(result.status!=="RUNNING")break;
        }
      }
      setStatus(result.incidents ? (result.incidents.length ? "Review "+result.incidents.join(", ") : "Analysis complete. No review rule matched.") : "Workflow status: "+result.status);
      refresh();
    } catch(error){setStatus(error.message)} finally {setBusy(false)}
  }
  return <form onSubmit={submit} style={{padding:20,background:"white",borderRadius:12,marginBottom:16,color:"#152b3c",display:"grid",gap:10}}>
    <h3>Analyze a new observation</h3>
    <label>Observation type <select value={kind} onChange={e=>setKind(e.target.value)}>{["report","email","message","aerial_alert","access_event","login_failure","login_success","network_anomaly","emergency","warning"].map(k=><option key={k}>{k}</option>)}</select></label>
    <input name="location" placeholder="Reported location" required maxLength={160}/>
    <textarea name="text" placeholder="Paste the original message or describe the observed event" rows={3} maxLength={15000} required/>
    {kind.startsWith("login_")&&<input name="account" placeholder="Account identifier" required/>}
    {kind==="access_event"&&<><label><input name="restricted_zone" type="checkbox"/> Restricted zone</label><label>Dwell time in seconds <input type="number" min="0" name="dwell_seconds" defaultValue="0"/></label></>}
    {kind==="emergency"&&<label><input name="confirmed" type="checkbox"/> Source reports confirmation</label>}
    <label><input name="simulated" type="checkbox" defaultChecked/> Interview simulation</label>
    <button className="btn primary" disabled={busy}>{busy?"Analyzing…":"Analyze observation"}</button>
    <output aria-live="polite">{status}</output>
  </form>
}
