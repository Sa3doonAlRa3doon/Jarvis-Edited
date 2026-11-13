function text(value) {
  return String(value || '').trim();
}

function available(devices, id) {
  return devices.find((item) => text(item?.id) === text(id)) || null;
}

function preferred(devices, pattern, excluded = new Set()) {
  return devices.find((item) => !excluded.has(text(item?.id)) && pattern.test(text(item?.label))) || null;
}

function isStableCamera(id) {
  return text(id).startsWith('/dev/v4l/by-id/');
}

function isStableMicrophone(id) {
  return text(id).startsWith('alsa:CARD=');
}

export function planPiDeviceMigration({ settings = {}, cameras = [], microphones = [] } = {}) {
  const next = { ...settings };
  const changes = [];
  const warnings = [];
  const cameraList = Array.isArray(cameras) ? cameras : [];
  const microphoneList = Array.isArray(microphones) ? microphones : [];

  const currentMain = available(cameraList, settings.piCamera);
  const main = currentMain && isStableCamera(currentMain.id)
    ? currentMain
    : preferred(cameraList, /\blenovo\b/i) || currentMain;
  if (settings.piCamera && main && main.id !== settings.piCamera) {
    next.piCamera = main.id;
    changes.push({ field: 'piCamera', from: settings.piCamera, to: main.id, label: text(main.label) });
  } else if (settings.piCamera && !main) warnings.push('No available main camera matches the current Pi selection.');

  const mainId = text(next.piCamera);
  const currentPrinter = available(cameraList, settings.printerPiCamera);
  const printer = currentPrinter && isStableCamera(currentPrinter.id) && currentPrinter.id !== mainId
    ? currentPrinter
    : preferred(cameraList, /^(?!.*\blenovo\b).+/i, new Set([mainId]))
      || cameraList.find((item) => text(item?.id) && text(item.id) !== mainId)
      || null;
  if (settings.printerPiCamera && printer && printer.id !== settings.printerPiCamera) {
    next.printerPiCamera = printer.id;
    changes.push({ field: 'printerPiCamera', from: settings.printerPiCamera, to: printer.id, label: text(printer.label) });
  } else if (settings.printerPiCamera && !printer) warnings.push('No separate printer camera is currently available.');

  const currentMicrophone = available(microphoneList, settings.piMicrophone);
  const microphone = currentMicrophone && isStableMicrophone(currentMicrophone.id)
    ? currentMicrophone
    : preferred(microphoneList, /\blenovo\b/i) || currentMicrophone;
  if (settings.piMicrophone && microphone && microphone.id !== settings.piMicrophone) {
    next.piMicrophone = microphone.id;
    changes.push({ field: 'piMicrophone', from: settings.piMicrophone, to: microphone.id, label: text(microphone.label) });
  } else if (settings.piMicrophone && !microphone) warnings.push('No available microphone matches the current Pi selection.');

  return { next, changes, warnings };
}
