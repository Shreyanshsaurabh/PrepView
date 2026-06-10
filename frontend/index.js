const questionsApiUrl = "http://127.0.0.1:5001/questions";
const evaluateApiUrl = "http://127.0.0.1:5001/evaluate";

let mediaRecorder;
let audioChunks = [];
let selectedQuestionId = null;

const questionList = document.getElementById("faqListContainer");
const selectedQuestion = document.getElementById("selectedQuestion");
const recordBtn = document.getElementById("recordBtn");
const recordingStatus = document.getElementById("recordingStatus");
const defaultText = document.getElementById("defaultText");
const evaluationResult = document.getElementById("evaluationResult");
const userAnswerEle = document.getElementById("userAnswer");

questionList.addEventListener("click", (e) => {
  const questionItem = e.target.closest("li");
  if (!questionItem) return;

  const questionText = questionItem.querySelector("p");
  if (!questionText) return;

  document.querySelectorAll("#faqListContainer li").forEach((item) => {
    item.classList.remove("bg-[#eff6ff]");
  });

  questionItem.classList.add("bg-[#eff6ff]");
  selectedQuestionId = questionItem.id || questionText.textContent.trim();
  console.log("🎯 Question locked successfully! ID Hook:", selectedQuestionId);

  if (defaultText) defaultText.classList.add("hidden");
  if (selectedQuestion) {
    selectedQuestion.classList.remove("hidden");
    selectedQuestion.textContent = questionText.textContent;
  }

  const selectedQuestionIconEle = document.getElementById("selectedQuestionIcon");
  if (selectedQuestionIconEle) selectedQuestionIconEle.classList.remove("hidden");

  if (evaluationResult) evaluationResult.classList.add("hidden");
  if (userAnswerEle) userAnswerEle.textContent = "";
  
  resetScores();
});

function resetScores() {
  const correctnessRatio = document.getElementById("correctness-ratio");
  const completenessRatio = document.getElementById("completeness-ratio");
  
  if (correctnessRatio) correctnessRatio.textContent = "0/5";
  if (completenessRatio) completenessRatio.textContent = "0/5";

  const allBars = document.querySelectorAll(".grid-cols-2 div.w-24.h-3");
  allBars.forEach((bar) => {
    bar.classList.remove("bg-[#3b82f6]");
    bar.classList.add("bg-[#f3f4f6]");
  });
}

recordBtn.addEventListener("click", async (e) => {
  if (e) e.preventDefault();

  console.log("Button clicked. Current selection target status:", selectedQuestionId);
  
  if (!selectedQuestionId) {
    alert("Please select a question from the sidebar first!");
    return;
  }

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    try {
      console.log("🎤 Requesting system audio microphone context...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        console.log("💾 Audio capture stopped. Blob compiled successfully. Size:", audioBlob.size);
        await sendAudioForEvaluation(audioBlob);
      };

      mediaRecorder.start();
      recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
      recordBtn.classList.remove("from-[#1a73e8]", "to-[#8ab4f8]", "bg-gradient-to-r");
      recordBtn.classList.add("bg-red-600");
      recordingStatus.textContent = "Recording... Speak now!";
    } catch (err) {
      console.error("Microphone hardware access rejected:", err);
      alert("Error accessing microphone: " + err.message);
    }
  } else {
    mediaRecorder.stop();
    recordBtn.innerHTML = '<i class="fas fa-microphone"></i> Record Answer';
    recordBtn.classList.remove("bg-red-600");
    recordBtn.classList.add("bg-gradient-to-r", "from-[#1a73e8]", "to-[#8ab4f8]");
    recordingStatus.textContent = "Processing metrics payload...";
  }
});

async function sendAudioForEvaluation(audioBlob) {
  const formData = new FormData();
  formData.append("answer", audioBlob);
  formData.append("questionId", selectedQuestionId);

  try {
    console.log("🚀 Dispatching audio payload over the network...");
    const response = await fetch(evaluateApiUrl, {
      method: "POST",
      body: formData,
    });

    console.log("📡 Server network transaction response status:", response.status);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const result = await response.json();
    displayEvaluation(result);
  } catch (error) {
    console.error("Network communication sequence dropped:", error);
    alert("Error evaluating answer: " + error.message);
  } finally {
    recordingStatus.textContent = "";
  }
}

function displayEvaluation(evaluation) {
  try {
    console.log("📥 Parsing evaluation array into canvas:", evaluation);
    const result = typeof evaluation === "string" ? JSON.parse(evaluation) : evaluation;

    document.getElementById("correctness-ratio").textContent = `${Math.round(result.correctness || 0)}/5`;
    document.getElementById("completeness-ratio").textContent = `${Math.round(result.completeness || 0)}/5`;
    
    if (userAnswerEle) userAnswerEle.textContent = result.user_answer || "Data array empty.";

    const scoreCards = document.querySelectorAll(".grid-cols-2 > div");
    if (scoreCards.length >= 2) {
      const correctnessBars = scoreCards[0].querySelectorAll("div.flex.gap-2 > div");
      const completenessBars = scoreCards[1].querySelectorAll("div.flex.gap-2 > div");

      updateProgressBars(correctnessBars, Math.round(result.correctness || 0));
      updateProgressBars(completenessBars, Math.round(result.completeness || 0));
    }

    const suggestionsText = document.getElementById("suggestions-text");
    if (suggestionsText) suggestionsText.textContent = result.feedback_suggestions || "";
    
    if (evaluationResult) {
      evaluationResult.classList.remove("hidden");
      console.log("✨ Score view active!");
    }
  } catch (err) {
    console.error("UI painting transaction failed:", err);
  }
}

function updateProgressBars(bars, score) {
  if (!bars) return;
  bars.forEach((bar, index) => {
    if (index < score) {
      bar.classList.remove("bg-[#f3f4f6]");
      bar.classList.add("bg-[#3b82f6]");
    } else {
      bar.classList.remove("bg-[#3b82f6]");
      bar.classList.add("bg-[#f3f4f6]");
    }
  });
}

async function getAndDisplayQuestions() {
  try {
    console.log("🔄 Initializing sidebar item list components...");
    const response = await fetch(questionsApiUrl);
    const faqList = await response.json();

    if (!questionList) return;
    questionList.innerHTML = "";
    
    faqList.forEach((topic) => {
      const topicSection = document.createElement("ul");
      topicSection.className = "mb-8 bg-white rounded-2xl list-none pl-0 overflow-hidden shadow-sm";

      const topicHeader = document.createElement("div");
      topicHeader.className = "text-xl font-bold text-white p-4 bg-gradient-to-r from-[#1a73e8] to-[#8ab4f8]";
      topicHeader.textContent = topic.topic;

      topicSection.appendChild(topicHeader);

      topic.questions.forEach((question, index) => {
        const questionItem = document.createElement("li");
        questionItem.className = "p-4 border-b border-[#e1e3e8] text-[#1f1f1f] transition-colors duration-300 hover:bg-[#f8f9fc] last:border-b-0 cursor-pointer";
        questionItem.id = question.id || `gen-id-${index}`;

        const text = document.createElement("p");
        text.className = "m-0 text-base text-[#1f1f1f] hover:text-blue-600 leading-relaxed";
        text.textContent = question.text;

        questionItem.appendChild(text);
        topicSection.appendChild(questionItem);
      });

      questionList.appendChild(topicSection);
    });
    console.log("✅ Sidebar item creation completed.");
  } catch (error) {
    console.error("Error fetching initial list structural maps:", error);
  }
}

getAndDisplayQuestions();

// Grab the new DOM elements
const topicInput = document.getElementById("topicInput");
const generateTopicBtn = document.getElementById("generateTopicBtn");

// Event Listener for the "Go" button
generateTopicBtn.addEventListener("click", async () => {
  const customTopic = topicInput.value.trim();
  
  if (!customTopic) {
    alert("Please enter a topic first!");
    return;
  }

  try {
    // Show loading state on the button
    generateTopicBtn.disabled = true;
    generateTopicBtn.textContent = "...";
    recordingStatus.textContent = `Generating questions for "${customTopic}"...`;

    console.log(`🌐 Requesting live questions from Mistral for topic: ${customTopic}`);

    // Call the modified backend endpoint
    const response = await fetch(questionsApiUrl, {
      method: "POST", // Changed to POST to send data
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic: customTopic })
    });

    if (!response.ok) throw new Error("Failed to generate custom questions.");

    const freshQuestions = await response.json();
    
    // Use your existing rendering logic to paint the new questions onto the sidebar
    renderQuestionsSidebar(freshQuestions);
    
    // Clear the input field
    topicInput.value = "";
    recordingStatus.textContent = `Loaded questions for "${customTopic}"!`;

  } catch (error) {
    console.error("Error generating customized topic:", error);
    alert("Error generating questions: " + error.message);
  } finally {
    generateTopicBtn.disabled = false;
    generateTopicBtn.textContent = "Go";
  }
});

// Helper modification: Move your rendering loop into its own function so we can reuse it
function renderQuestionsSidebar(faqList) {
  if (!questionList) return;
  questionList.innerHTML = "";
  
  faqList.forEach((topic) => {
    const topicSection = document.createElement("ul");
    topicSection.className = "mb-8 bg-white rounded-2xl list-none pl-0 overflow-hidden shadow-sm";

    const topicHeader = document.createElement("div");
    topicHeader.className = "text-xl font-bold text-white p-4 bg-gradient-to-r from-[#1a73e8] to-[#8ab4f8]";
    topicHeader.textContent = topic.topic;

    topicSection.appendChild(topicHeader);

    topic.questions.forEach((question, index) => {
      const questionItem = document.createElement("li");
      questionItem.className = "p-4 border-b border-[#e1e3e8] text-[#1f1f1f] transition-colors duration-300 hover:bg-[#f8f9fc] last:border-b-0 cursor-pointer";
      questionItem.id = question.id || `gen-id-${index}`;

      const text = document.createElement("p");
      text.className = "m-0 text-base text-[#1f1f1f] hover:text-blue-600 leading-relaxed";
      text.textContent = question.text;

      questionItem.appendChild(text);
      topicSection.appendChild(questionItem);
    });

    questionList.appendChild(topicSection);
  });
}

// Update your old function to just use the new helper renderer
async function getAndDisplayQuestions() {
  try {
    const response = await fetch(questionsApiUrl);
    const faqList = await response.json();
    renderQuestionsSidebar(faqList);
  } catch (error) {
    console.error("Error fetching initial list maps:", error);
  }
}