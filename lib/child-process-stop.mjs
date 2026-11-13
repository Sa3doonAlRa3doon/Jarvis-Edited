function boundedDelay(value, fallback) {
  const parsed = Number(value);
  return Math.max(0, Math.min(10_000, Number.isFinite(parsed) ? parsed : fallback));
}

function exited(child) {
  return !child || child.exitCode !== null || child.signalCode != null;
}

export async function terminateChildProcess(child, { graceMs = 2500, forceWaitMs = 1500 } = {}) {
  if (exited(child)) return true;
  const gracefulDelay = boundedDelay(graceMs, 2500);
  const forcedDelay = boundedDelay(forceWaitMs, 1500);
  return new Promise((resolve) => {
    let settled = false;
    let graceTimer;
    let forceTimer;
    const onExit = () => finish(true);
    const finish = (didExit) => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      clearTimeout(forceTimer);
      child.off?.('exit', onExit);
      resolve(Boolean(didExit));
    };
    child.once?.('exit', onExit);
    try { child.kill('SIGTERM'); }
    catch { finish(false); return; }
    graceTimer = setTimeout(() => {
      if (exited(child)) { finish(true); return; }
      try { child.kill('SIGKILL'); }
      catch { finish(false); return; }
      forceTimer = setTimeout(() => finish(exited(child)), forcedDelay);
    }, gracefulDelay);
  });
}
