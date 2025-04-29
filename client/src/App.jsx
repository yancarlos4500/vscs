import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3001");
const peerConnectionMap = {};
const pendingCandidates = {};

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const channels = [
  "PHX-3 3365", "FLOW DITHER MONROE RING", "D-17", "D-29", "D-39", "D-43",
  "PHX-5 3343", "D-46", "D-48", "D-58", "D-67", "D-68",
  "PHX-6 3361", "D-86", "PHX DEPT WEST", "PHX DEPT EAST", "ADC SUP", "MAIN RING",
  "PROG CONF", "CALL RMS", "VOICE MON", "", "", "",
  "G/G1", "PRI", "SCRN ALT", "FUNC ALT", "G/G5 ALT", "PSN REL",
  "G/G5", "OVR", "HOLLER ON/OFF", "RLS"
];

const App = () => {
  const localStreamRef = useRef(null);
  const [activeChannels, setActiveChannels] = useState(new Set());
  const [disabledChannels, setDisabledChannels] = useState(new Set());

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      localStreamRef.current = stream;
      console.log("Local stream initialized");
    }).catch(e => console.error("Mic error:", e));

    socket.on("offer", async ({ offer, channel }) => {
      console.log("Received offer for", channel);
      console.log("OFFER CONTENT:", offer);

      if (!offer || !offer.type || !offer.sdp) {
        console.error("Invalid offer object received ❌", offer);
        return;
      }

      if (!peerConnectionMap[channel]) {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnectionMap[channel] = pc;

        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("candidate", { candidate: event.candidate, channel });
          }
        };

        pc.ontrack = (event) => {
          console.log("Remote track received for", channel);
          const remoteAudio = new Audio();
          remoteAudio.srcObject = event.streams[0];
          remoteAudio.autoplay = true;
          remoteAudio.muted = false;
          remoteAudio.play().catch(err => console.error("Remote audio play error:", err));
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.log("Remote description set ✅", channel);
        } catch (err) {
          console.error("setRemoteDescription failed ❌", err);
        }

        if (pendingCandidates[channel]) {
          for (const cand of pendingCandidates[channel]) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.error("addIceCandidate failed ❌", err);
            }
          }
          delete pendingCandidates[channel];
        }

        try {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { answer, channel });
          console.log("Answer sent ✅", channel);
        } catch (err) {
          console.error("createAnswer/setLocalDescription failed ❌", err);
        }
      }
    });

    socket.on("answer", async ({ answer, channel }) => {
      const pc = peerConnectionMap[channel];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log("Received answer for", channel);
        } catch (err) {
          console.error("Answer processing error:", err);
        }
      }
    });

    socket.on("candidate", ({ candidate, channel }) => {
      const pc = peerConnectionMap[channel];
      if (pc && pc.remoteDescription?.type) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e =>
          console.error("Failed to add ICE candidate:", e)
        );
      } else {
        if (!pendingCandidates[channel]) pendingCandidates[channel] = [];
        pendingCandidates[channel].push(candidate);
        console.log("Queued ICE candidate for", channel);
      }
    });
  }, []);

  const toggleChannel = async (label) => {
    if (disabledChannels.has(label)) {
      console.log("Ignoring click, channel busy:", label);
      return;
    }

    const updated = new Set(activeChannels);
    const disabled = new Set(disabledChannels);
    disabled.add(label);
    setDisabledChannels(disabled);

    if (updated.has(label)) {
      updated.delete(label);
      if (peerConnectionMap[label]) {
        peerConnectionMap[label].close();
        delete peerConnectionMap[label];
        console.log("Disconnected from", label);
      }
    } else {
      updated.add(label);
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionMap[label] = pc;

      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("candidate", { candidate: event.candidate, channel: label });
        }
      };

      pc.ontrack = (event) => {
        console.log("Remote track received for", label);
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.muted = false;
        remoteAudio.play().catch(err => console.error("Remote audio play error:", err));
      };

      socket.emit("join-channel", label);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { offer, channel: label });
      console.log("Sent offer for", label);
    }

    setTimeout(() => {
      disabled.delete(label);
      setDisabledChannels(new Set(disabled));
    }, 5000);

    setActiveChannels(updated);
  };

  return (
    <div style={{ background: '#111', padding: 20, minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 90px)', gridAutoRows: '60px', gap: 4 }}>
        {channels.map((label, idx) => (
          <div
            key={idx}
            onClick={() => toggleChannel(label)}
            style={{
              background: disabledChannels.has(label)
                ? 'grey'
                : activeChannels.has(label)
                ? 'lime'
                : '#444',
              color: 'white',
              border: '1px solid #999',
              borderRadius: 4,
              fontSize: 11,
              textAlign: 'center',
              padding: 4,
              cursor: disabledChannels.has(label) ? 'not-allowed' : 'pointer',
              whiteSpace: 'pre-line'
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
