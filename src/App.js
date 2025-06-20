import React, { useEffect, useRef, useState, useCallback } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Toaster } from 'react-hot-toast';
import './App.css';
import toast from 'react-hot-toast';

const getOrCreateCallObject = () => {
  // Use a property on window to store the singleton
  if (!window._dailyCallObject) {
    window._dailyCallObject = DailyIframe.createCallObject();
  }
  return window._dailyCallObject;
};

function App() {
  const callRef = useRef(null);
  const localVideoRef = useRef(null);
  const [remoteParticipants, setRemoteParticipants] = useState({});
  const [localParticipant, setLocalParticipant] = useState(null);
  const [status, setStatus] = useState('');
  const [isStatusVisible, setIsStatusVisible] = useState(""); // "", "NEUTRAL", "SUCCESS", "FAILED"
  const [isConversationVisible, setIsConversationVisible] = useState(false);
  const [conversationUrl, setConversationUrl] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const API_KEY = process.env.REACT_APP_TAVUS_API_KEY;

  const createPersona = async () => {
    const requestBody = {
      "persona_name": "Personal Skin Doctor",
      "pipeline_mode": "full",
      "system_prompt": "You are a friendly Personal Skin Doctor who know cures to all the disease in the world. In this call, users want to know what are the cures to the user's disease",
      "context": "User want to know what is the cure to his/her skin problem. When a user says \"What is the cure to X\" or \"What is the solution to X\", you should acknowledge their disease and use the get_skin_cures tool to return the cures of the disease's cures based on user request",
      "layers": {
        "tts": {
          "tts_engine": "cartesia",
          "tts_emotion_control": true,
        },
        "llm": {
          "tools": [
            {
              "type": "function",
              "function": {
                "name": "get_skin_cures",
                "parameters": {
                  "type": "object",
                  "required": ["disease"],
                  "properties": {
                    "disease": {
                      "type": "string",
                      "description": "The disease which the user wanted to know how to cure"
                    }
                  }
                },
                "description": "Record the user's disease"
              }
            }
          ],
          "model": "tavus-llama",
          "speculative_inference": true
        },
        "perception": {
          "perception_model": "raven-0",
          "ambient_awareness_queries": [
            "Is the user have an acne in his or her face?",
            "Does the user appear distressed or uncomfortable?"
          ],
          "perception_analysis_queries": [
            "Is the user wearing an outfit with dark colors?",
            "Is the user male?"
          ],
          "perception_tool_prompt": "You have a tool to notify the system when an acne is detected on user face, named `acne_detected`. You MUST use this tool when an acne is detected on user face.",
          "perception_tools": [
            {
              "type": "function",
              "function": {
                "name": "acne_detected",
                "description": "Use this function when acne is detected in the image with high confidence",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "have_acne": {
                      "type": "boolean",
                      "description": "is acne detected on user's face?"
                    }
                  },
                  "required": [
                    "have_acne"
                  ]
                }
              }
            }
          ]
        },
        "stt": {
          "stt_engine": "tavus-advanced",
          "participant_pause_sensitivity": "high",
          "participant_interrupt_sensitivity": "high",
          "smart_turn_detection": true,
        }
      }
    };

    const options = {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    try {
      const response = await fetch('https://tavusapi.com/v2/personas', options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        throw new Error(`Expected JSON response but got: ${contentType}. Response: ${responseText.substring(0, 200)}...`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error creating persona:', err);
      throw err;
    }
  };

  const createCall = async () => {
    try {
      const persona = await createPersona();
      const personaId = persona.persona_id;

      const callRequestBody = {
        "replica_id": "r6583a465c",
        "persona_id": personaId,
      };

      const options = {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(callRequestBody)
      };

      const response = await fetch('https://tavusapi.com/v2/conversations', options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error creating call:', err);
      throw err;
    }
  };

  // Screen sharing functions
  const startScreenShare = async () => {
    const call = callRef.current;
    if (!call) {
      console.error('Call object not available');
      return;
    }

    try {
      await call.startScreenShare();
      setIsScreenSharing(true);
      toast.success('Screen sharing started', { duration: 3000 });
    } catch (error) {
      console.error('Error starting screen share:', error);
      toast.error('Failed to start screen sharing: ' + error.message, { duration: 5000 });
    }
  };

  const stopScreenShare = async () => {
    const call = callRef.current;
    if (!call) {
      console.error('Call object not available');
      return;
    }

    try {
      await call.stopScreenShare();
      setIsScreenSharing(false);
      toast.success('Screen sharing stopped', { duration: 3000 });
    } catch (error) {
      console.error('Error stopping screen share:', error);
      toast.error('Failed to stop screen sharing: ' + error.message, { duration: 5000 });
    }
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  const lastAcneDetectionTime = useRef(0);
  const isProcessingAcneDetection = useRef(false);
  const ACNE_DETECTION_COOLDOWN = 30000;

  const handleAppMessage = useCallback(async (event) => {
    const cureForSkin = {
      "pimples": "Use a mild cleanser, avoid touching your face, and apply a benzoyl peroxide cream",
      "sunburn": "Apply aloe vera or a cooling moisturizer, and stay out of the sun",
      "wrinkles": "Use sunscreen daily, moisturize, and avoid smoking or tanning",
      "oilyskin": "Use oil-free products, gentle cleansers, and don't overwash your face",
      "darkspot": "Try topical treatments like vitamin C, retinoids, or consult for chemical peels",
      "dryskin": "Moisturize regularly, use gentle cleansers, and avoid hot showers"
    };
    
    const message = event.data;
    
    if (!message || !message.message_type || !message.event_type) {
      console.log('Invalid message structure:', message);
      return;
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.replica.started_speaking') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.replica.started_speaking');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.replica.stopped_speaking') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.replica.stopped_speaking');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.user.started_speaking') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.user.started_speaking');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.user.stopped_speaking') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.user.stopped_speaking');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }
    
    if (message.message_type === 'conversation' && message.event_type === 'conversation.utterance') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.utterance');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.replica_interrupted') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.replica_interrupted');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.perception_analysis') {
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.perception_analysis');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
      console.log('perception_analysis')
    }
    
    if (message.message_type === 'conversation' && message.event_type === 'conversation.tool_call') {
      const toolCall = message.properties;
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.tool_call');
      toast.success('Event Broadcasted : ' + JSON.stringify(message, null, 2), {
        duration: 5000,
        style: {
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
        },
      });
      
      if (!toolCall) {
        console.log('No tool call found in message properties');
        return;
      }

      if (toolCall.name === 'get_skin_cures') {
        try {
          const args = JSON.parse(toolCall.arguments);
          const disease = args.disease;
          
          const diseaseclear = disease.trim().toLowerCase();
          const cure = cureForSkin[diseaseclear];
          
          const responseMessage = {
            message_type: "conversation",
            event_type: "conversation.echo",
            conversation_id: message.conversation_id,
            properties: {
              text: `If you're getting ${disease} i suggest to ${cure}.`
            }
          };
          
          // Use the call object to send app message
          const call = callRef.current;
          if (call && typeof call.sendAppMessage === 'function') {
            call.sendAppMessage(responseMessage, '*');
          } else {
            console.error('Call object is not available or sendAppMessage method is missing');
          }
        } catch (error) {
          console.error('Error in processing cure request:', error);
        }
      }
    }

    if (message.message_type === 'conversation' && message.event_type === 'conversation.perception_tool_call') {
      const perceptionToolCall = message.properties;
      setIsStatusVisible("NEUTRAL");
      setStatus('Last Event Broadcasted : conversation.perception_tool_call');
      toast.success('Event Broadcasted : conversation.perception_tool_call', { duration: 5000});

      if (!perceptionToolCall) {
        console.log('No perception tool call found in message properties');
        return;
      }

      if (perceptionToolCall.name === 'acne_detected') {
        const currentTime = Date.now();
        
        // Check if we're still in cooldown period
        if (currentTime - lastAcneDetectionTime.current < ACNE_DETECTION_COOLDOWN) {
          return;
        }
        
        // Check if we're already processing
        if (isProcessingAcneDetection.current) {
          return;
        }

        try {
          isProcessingAcneDetection.current = true;
          lastAcneDetectionTime.current = currentTime;
          
          const responseMessage = {
            message_type: "conversation",
            event_type: "conversation.echo",
            conversation_id: message.conversation_id,
            properties: {
              text: `I notice that you have acne on your face. I suggest using topical antibiotics like clindamycin and erythromycin.`
            }
          };
          
          const call = callRef.current;
          if (call && typeof call.sendAppMessage === 'function') {
            call.sendAppMessage(responseMessage, '*');
            
            // Reset processing flag after a delay
            setTimeout(() => {
              isProcessingAcneDetection.current = false;
            }, 2000); // 2 seconds to allow message to be processed
            
          } else {
            console.error('Call object is not available or sendAppMessage method is missing');
            isProcessingAcneDetection.current = false; // Reset on error
          }
        } catch (error) {
          console.error('Error in processing acne detection:', error);
          isProcessingAcneDetection.current = false; // Reset on error
        }
      }
    }
  }, []);

  const handleScreenShareStarted = useCallback(() => {
    console.log('Screen share started');
    setIsScreenSharing(true);
    updateParticipants();
  }, []);

  const handleScreenShareStopped = useCallback(() => {
    console.log('Screen share stopped');
    setIsScreenSharing(false);
    updateParticipants();
  }, []);

  // Handle participants
  const updateParticipants = () => {
    const call = callRef.current;
    if (!call) return;
    
    const participants = call.participants();
    const remotes = {};
    let local = null;
    
    Object.entries(participants).forEach(([id, p]) => {
      if (id === 'local') {
        local = p;
      } else {
        remotes[id] = p;
      }
    });
    
    setRemoteParticipants(remotes);
    setLocalParticipant(local);
  };

  // Attach video and audio tracks
  useEffect(() => {
    // Handle remote participants
    Object.entries(remoteParticipants).forEach(([id, p]) => {
      // Video
      const videoEl = document.getElementById(`remote-video-${id}`);
      if (videoEl) {
        if (p.tracks.screenVideo && p.tracks.screenVideo.state === 'playable' && p.tracks.screenVideo.persistentTrack) {
          videoEl.srcObject = new MediaStream([p.tracks.screenVideo.persistentTrack]);
        } else if (p.tracks.video && p.tracks.video.state === 'playable' && p.tracks.video.persistentTrack) {
          videoEl.srcObject = new MediaStream([p.tracks.video.persistentTrack]);
        }
      }
      // Audio remains the same
      const audioEl = document.getElementById(`remote-audio-${id}`);
      if (audioEl && p.tracks.audio && p.tracks.audio.state === 'playable' && p.tracks.audio.persistentTrack) {
        audioEl.srcObject = new MediaStream([p.tracks.audio.persistentTrack]);
      }
    });

    // Handle local participant
    if (localParticipant && localVideoRef.current) {
      const localVideo = localVideoRef.current;
      if (localParticipant.tracks.screenVideo && localParticipant.tracks.screenVideo.state === 'playable' && localParticipant.tracks.screenVideo.persistentTrack) {
        localVideo.srcObject = new MediaStream([localParticipant.tracks.screenVideo.persistentTrack]);
      } else if (localParticipant.tracks.video && localParticipant.tracks.video.state === 'playable' && localParticipant.tracks.video.persistentTrack) {
        localVideo.srcObject = new MediaStream([localParticipant.tracks.video.persistentTrack]);
      }
    }
  }, [remoteParticipants, localParticipant]);

  // Initialize call object when conversation URL is available
  useEffect(() => {
    if (!conversationUrl) return;

    // Get or create call object
    const call = getOrCreateCallObject();
    callRef.current = call;

    console.log('Joining meeting with URL:', conversationUrl);

    // Join meeting
    call.join({ url: conversationUrl, userName: "You" }).then(() => {
      console.log("Joined Conversation successfully!");
      setIsStatusVisible("SUCCESS");
      setStatus("Connected successfully!");
    }).catch((error) => {
      console.error("Failed to join conversation:", error);
      setIsStatusVisible("FAILED");
      setStatus("Failed to connect");
    });

    // Add event listeners
    call.on('participant-joined', updateParticipants);
    call.on('participant-updated', updateParticipants);
    call.on('participant-left', updateParticipants);
    call.on('app-message', handleAppMessage);
    
    // Screen share event listeners
    call.on('started-screen-share', () => {
      console.log('Screen share started');
      setIsScreenSharing(true);
      updateParticipants(); // Update to show screen share track
    });
    
    call.on('stopped-screen-share', () => {
      console.log('Screen share stopped');
      setIsScreenSharing(false);
      updateParticipants(); // Update to remove screen share track
    });
    
    call.on('joined-meeting', () => {
      setIsStatusVisible("SUCCESS");
      setStatus('Connected successfully!');
      setIsConversationVisible(true);
      updateParticipants();
    });
    
    call.on('left-meeting', () => {
      setIsStatusVisible("NEUTRAL");
      setStatus('Disconnected');
      setIsConversationVisible(false);
      setIsScreenSharing(false);
    });
    
    call.on('error', (error) => {
      console.error('Call error:', error);
      setIsStatusVisible("FAILED");
      setStatus('Connection error');
    });

    // Cleanup
    return () => {
      if (call) {
        call.off('participant-joined', updateParticipants);
        call.off('participant-updated', updateParticipants);
        call.off('participant-left', updateParticipants);
        call.off('app-message', handleAppMessage);
        call.off('started-screen-share', handleScreenShareStarted);
        call.off('stopped-screen-share', handleScreenShareStopped);
        call.leave();
      }
    };
  }, [conversationUrl, handleAppMessage, handleScreenShareStarted, handleScreenShareStopped]);

  const joinConversation = () => {
    setIsStatusVisible("NEUTRAL");
    setStatus('Creating call...');
    
    createCall().then(response => {
      const conversationURL = response.conversation_url;

      if (!conversationURL) {
        setIsStatusVisible("FAILED");
        setStatus('Failed to get conversation URL');
        return;
      }

      setIsStatusVisible("NEUTRAL");
      setStatus('Joining conversation...');
      
      // Set the conversation URL which will trigger the useEffect to join
      setConversationUrl(conversationURL);
      
    }).catch(error => {
      console.error("Failed to create call:", error);
      setIsStatusVisible("FAILED");
      setStatus("Failed to create call");
    });
  };

  const leaveConversation = () => {
    const call = callRef.current;
    if (call) {
      call.leave();
    }
    setConversationUrl(null);
    setIsConversationVisible(false);
    setRemoteParticipants({});
    setLocalParticipant(null);
    setIsScreenSharing(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const call = callRef.current;
      if (call) {
        try {
          call.leave();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
      }
    };
  }, []);

  return (
    <div className="App">
      <Toaster position="top-right" reverseOrder={false} />
      <div className="top">
        <img src={require("./logo-tavus.png")} alt="background" className="background-image" />
        <h1>Tavus Event Broadcast</h1>
        <p>Demonstration of all type of event broadcasted by Tavus.</p>
        <div className='input-container'>
          <div className="button-container">
            <button className="button" onClick={() => joinConversation()}>Join Call</button>
            {isConversationVisible && (
              <button className="button" onClick={leaveConversation} style={{backgroundColor: '#dc3545'}}>Leave Call</button>
            )}
            {isConversationVisible && (
              <button 
                className="button" 
                onClick={toggleScreenShare} 
                style={{backgroundColor: isScreenSharing ? '#6c757d' : '#28a745'}}
              >
                {isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
              </button>
            )}
          </div>
          <div id="status" className={`fade ${isStatusVisible === "NEUTRAL" ? 'visible neutral' : ( isStatusVisible === "SUCCESS" ? 'visible success' : (isStatusVisible === "FAILED" && 'visible failed'))}`}>{status}</div>
        </div>
      </div>
      
      <div className="frosted-wrapper">
        <div className="frosted-glass"></div>
        <div className={`fade ${isConversationVisible ? 'visible' : ''}`} style={{padding: '20px'}}>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px'}}>
            {localParticipant && (
              <div
                style={{
                  position: 'relative',
                  backgroundColor: '#1f2937',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  aspectRatio: '16/9',
                  minHeight: '200px',
                  border: '2px solid #3b82f6'
                }}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: (localParticipant.tracks.screenVideo && localParticipant.tracks.screenVideo.state === 'playable') ? 'none' : 'scaleX(-1)'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}>
                  {(localParticipant.tracks.screenVideo && localParticipant.tracks.screenVideo.state === 'playable') ? 'Your Screen' : 'You'}
                </div>
                {isScreenSharing && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    backgroundColor: 'rgba(40, 167, 69, 0.8)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    Sharing Screen
                  </div>
                )}
              </div>
            )}

            {Object.entries(remoteParticipants).map(([id, p]) => (
              <div
                key={id}
                style={{
                  position: 'relative',
                  backgroundColor: '#1f2937',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  aspectRatio: '16/9',
                  minHeight: '200px'
                }}
              >
                <video
                  id={`remote-video-${id}`}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
                <audio id={`remote-audio-${id}`} autoPlay playsInline />
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}>
                  {p.user_name || `Doctor ${id.slice(-4)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;