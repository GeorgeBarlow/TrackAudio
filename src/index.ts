import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  systemPreferences,
} from "electron";

import { TrackAudioAfv, AFVEventTypes } from "trackaudio-afv";
import { Configuration } from "./config.d";
import Store from "electron-store";
import { uIOhook } from "uiohook-napi";
import { getKeyFromNumber } from "./helper";

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let version = "";
let mainWindow: BrowserWindow = null;

let isSettingPtt = false;

let currentConfiguration: Configuration = {
  audioApi: -1,
  audioInputDeviceId: "",
  headsetOutputDeviceId: "",
  speakerOutputDeviceId: "",
  cid: "",
  password: "",
  callsign: "",
  pttKey: 0,
  hardwareType: 0,
};
const store = new Store();

const saveConfig = () => {
  store.set("configuration", JSON.stringify(currentConfiguration));
};

const setAudioSettings = () => {
  TrackAudioAfv.SetAudioSettings(
    currentConfiguration.audioApi || -1,
    currentConfiguration.audioInputDeviceId || "",
    currentConfiguration.headsetOutputDeviceId || "",
    currentConfiguration.speakerOutputDeviceId || ""
  );
  TrackAudioAfv.SetHardwareType(currentConfiguration.hardwareType || 0);
};

const setupUiHook = () => {
  uIOhook.on("keydown", (e) => {
    if (isSettingPtt) {
      currentConfiguration.pttKey = e.keycode;
      saveConfig();
      isSettingPtt = false;

      mainWindow.webContents.send("ptt-key-set", getKeyFromNumber(e.keycode));
    } else {
      if (e.keycode == currentConfiguration.pttKey && e.keycode != 0) {
        TrackAudioAfv.SetPtt(true);
      }
    }
  });

  uIOhook.on("keyup", (e) => {
    if (e.keycode == currentConfiguration.pttKey && e.keycode != 0) {
      TrackAudioAfv.SetPtt(false);
    }
  });

  uIOhook.start();
};

const createWindow = (): void => {
  // load the configuration
  currentConfiguration = JSON.parse(
    store.get("configuration", "{}") as string
  ) as Configuration;

  // Set the store CID
  TrackAudioAfv.SetCid(currentConfiguration.cid || "");

  version = TrackAudioAfv.GetVersion();

  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 660,
    width: 800,
    minWidth: 265,
    minHeight: 230,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  if (process.platform !== "darwin") {
    mainWindow.setMenu(null);
  }
  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  setupUiHook();
  // Open the DevTools only in development mode.
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", (e) => {
    if (TrackAudioAfv.IsConnected()) {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: "question",
        buttons: ["Yes", "No"],
        title: "Confirm",
        message: "Are you sure you want to quit?",
      });

      if (response == 1) {
        e.preventDefault();
      }
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  const continueWithoutUpdate = TrackAudioAfv.Bootstrap(process.resourcesPath);
  if (!continueWithoutUpdate) {
    dialog.showMessageBoxSync({
      type: "error",
      message:
        "A new mandatory version is available, please update in order to continue.",
      buttons: ["OK"],
    });
    app.quit();
  }

  if (
    process.platform === "darwin" &&
    !systemPreferences.isTrustedAccessibilityClient(true)
  ) {
    dialog.showMessageBoxSync({
      type: "info",
      message:
        "This application requires accessibility permissions (for push to talk to work). Please grant these in System Preferences.",
      buttons: ["OK"],
    });
  }

  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  TrackAudioAfv.Exit();
  app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.on("set-always-on-top", (_, state: boolean) => {
  mainWindow.setAlwaysOnTop(state);
});

ipcMain.handle("audio-get-apis", () => {
  return TrackAudioAfv.GetAudioApis();
});

ipcMain.handle("audio-get-input-devices", (_, apiId: string) => {
  return TrackAudioAfv.GetAudioInputDevices(apiId);
});

ipcMain.handle("audio-get-output-devices", (_, apiId: string) => {
  return TrackAudioAfv.GetAudioOutputDevices(apiId);
});

ipcMain.handle("get-configuration", () => {
  return currentConfiguration;
});

//
// AFV audio settings
//

ipcMain.handle("set-audio-input-device", (_, deviceId: string) => {
  currentConfiguration.audioInputDeviceId = deviceId;
  saveConfig();
});

ipcMain.handle("set-headset-output-device", (_, deviceId: string) => {
  currentConfiguration.headsetOutputDeviceId = deviceId;
  saveConfig();
});

ipcMain.handle("set-speaker-output-device", (_, deviceId: string) => {
  currentConfiguration.speakerOutputDeviceId = deviceId;
  saveConfig();
});

ipcMain.handle("set-audio-api", (_, apiId: number) => {
  currentConfiguration.audioApi = apiId;
  saveConfig();
});

//
// AFV login settings
//

ipcMain.handle("set-cid", (_, cid: string) => {
  currentConfiguration.cid = cid;
  saveConfig();
  TrackAudioAfv.SetCid(cid);
});

ipcMain.handle("set-password", (_, password: string) => {
  currentConfiguration.password = password;
  saveConfig();
});

//
// AFV actions
//

ipcMain.handle("connect", () => {
  if (!currentConfiguration.password || !currentConfiguration.cid) {
    return false;
  }
  setAudioSettings();
  return TrackAudioAfv.Connect(currentConfiguration.password);
});

ipcMain.handle("disconnect", () => {
  TrackAudioAfv.Disconnect();
});

ipcMain.handle(
  "audio-add-frequency",
  (_, frequency: number, callsign: string) => {
    return TrackAudioAfv.AddFrequency(frequency, callsign);
  }
);

ipcMain.handle("audio-remove-frequency", (_, frequency: number) => {
  TrackAudioAfv.RemoveFrequency(frequency);
});

ipcMain.handle(
  "audio-set-frequency-state",
  (
    _,
    frequency: number,
    rx: boolean,
    tx: boolean,
    xc: boolean,
    onSpeaker: boolean,
    crossCoupleAcross: boolean
  ) => {
    return TrackAudioAfv.SetFrequencyState(
      frequency,
      rx,
      tx,
      xc,
      onSpeaker,
      crossCoupleAcross
    );
  }
);

ipcMain.handle("audio-get-frequency-state", (_, frequency: number) => {
  return TrackAudioAfv.GetFrequencyState(frequency);
});

ipcMain.handle("audio-is-frequency-active", (_, frequency: number) => {
  return TrackAudioAfv.IsFrequencyActive(frequency);
});

ipcMain.handle("get-station", (_, callsign: string) => {
  TrackAudioAfv.GetStation(callsign);
});

ipcMain.handle("refresh-station", (_, callsign: string) => {
  TrackAudioAfv.RefreshStation(callsign);
});

ipcMain.handle("setup-ptt", () => {
  isSettingPtt = true;
});

ipcMain.handle("set-radio-gain", (_, gain: number) => {
  TrackAudioAfv.SetRadioGain(gain);
});

ipcMain.handle("set-hardware-type", (_, type: number) => {
  currentConfiguration.hardwareType = type;
  saveConfig();
  TrackAudioAfv.SetHardwareType(type);
});

ipcMain.handle("start-mic-test", () => {
  setAudioSettings();
  TrackAudioAfv.StartMicTest();
});

ipcMain.handle("stop-mic-test", () => {
  mainWindow.webContents.send("MicTest", "0.0", "0.0");
  TrackAudioAfv.StopMicTest();
});

ipcMain.handle(
  "dialog",
  (
    _,
    type: "none" | "info" | "error" | "question" | "warning",
    title: string,
    message: string,
    buttons: string[]
  ) => {
    return dialog.showMessageBox(mainWindow, {
      type,
      title,
      buttons,
      message,
    });
  }
);

ipcMain.handle("get-version", () => {
  return version;
});

//
// Callbacks
//
TrackAudioAfv.RegisterCallback((arg: string, arg2: string, arg3: string) => {
  if (arg == undefined) {
    return;
  }

  if (arg == "MicTest") {
    mainWindow.webContents.send("MicTest", arg2, arg3);
  }

  if (arg == AFVEventTypes.FrequencyRxBegin) {
    mainWindow.webContents.send("FrequencyRxBegin", arg2);
  }

  if (arg == AFVEventTypes.FrequencyRxEnd) {
    mainWindow.webContents.send("FrequencyRxEnd", arg2);
  }

  if (arg == AFVEventTypes.StationTransceiversUpdated) {
    mainWindow.webContents.send("station-transceivers-updated", arg2, arg3);
  }

  if (arg == AFVEventTypes.StationDataReceived) {
    mainWindow.webContents.send("station-data-received", arg2, arg3);
  }

  if (arg == AFVEventTypes.PttState) {
    mainWindow.webContents.send("PttState", arg2);
  }

  if (arg == AFVEventTypes.Error) {
    mainWindow.webContents.send("error", arg2);
  }

  if (arg == AFVEventTypes.VoiceConnected) {
    mainWindow.webContents.send("VoiceConnected");
  }

  if (arg == AFVEventTypes.VoiceDisconnected) {
    mainWindow.webContents.send("VoiceDisconnected");
  }

  if (arg == AFVEventTypes.NetworkConnected) {
    mainWindow.webContents.send("network-connected", arg2, arg3);
  }

  if (arg == AFVEventTypes.NetworkDisconnected) {
    mainWindow.webContents.send("network-disconnected");
  }
});
