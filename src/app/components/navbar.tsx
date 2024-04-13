import React, { useState } from "react";
import "../style/navbar.scss";
import Clock from "./clock";
import SettingsModal from "./settings-modal/settings-modal";
import useErrorStore from "../store/errorStore";
import useRadioState from "../store/radioStore";
import useSessionStore from "../store/sessionStore";
import clsx from "clsx";

const Navbar: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [radios, removeRadio] = useRadioState((state) => [
    state.radios,
    state.removeRadio,
  ]);
  const postError = useErrorStore((state) => state.postError);
  const [
    isConnected,
    isConnecting,
    setIsConnecting,
    setIsConnected,
    callsign,
    isNetworkConnected,
    radioGain,
    setRadioGain
  ] = useSessionStore((state) => [
    state.isConnected,
    state.isConnecting,
    state.setIsConnecting,
    state.setIsConnected,
    state.callsign,
    state.isNetworkConnected,
    state.radioGain,
    state.setRadioGain,
  ]);

  const handleConnectDisconnect = () => {
    if (isConnected) {
      window.api.disconnect().then(() => {
        radios.map((e) => {
          removeRadio(e.frequency);
        });
      });

      return;
    }

    setIsConnecting(true);
    window.api.connect().then((ret) => {
      if (!ret) {
        postError(
          "Error connecting to AFV, check your configuration and credentials."
        );
        setIsConnecting(false);
        setIsConnected(false);
      }
    });
  };

  const handleRadioGainChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    window.api.SetRadioGain(event.target.valueAsNumber / 100).then(() => {
      setRadioGain(event.target.valueAsNumber);
    });
  };

  return (
    <>
      <div className="d-flex flex-md-row align-items-center p-3 px-md-4 mb-3 custom-navbar">
        <Clock />
        <span className="btn text-box-container m-2">
          {isNetworkConnected ? callsign : "Not Connected"}
        </span>
        <button
          className={clsx(
            "btn m-2 hide-connect-flex",
            !isConnected && "btn-info",
            isConnecting && "loading-button",
            isConnected && "btn-danger"
          )}
          onClick={() => handleConnectDisconnect()}
          disabled={isConnecting || !isNetworkConnected}
        >
          {isConnected
            ? "Disconnect"
            : isConnecting
            ? "Connecting..."
            : "Connect"}
        </button>
        <button
          className="btn btn-info m-2 hide-settings-flex"
          disabled={isConnected || isConnecting}
          onClick={() => setShowModal(true)}
        >
          Settings
        </button>

        <span className="btn text-box-container m-2 hide-gain-value">Gain: {radioGain}%</span>
        <input type="range" className="form-range m-2 gain-slider" min="0" max="100" step="1" onChange={handleRadioGainChange}></input>
        
      </div>
      {showModal && <SettingsModal closeModal={() => setShowModal(false)} />}
    </>
  );
};

export default Navbar;
