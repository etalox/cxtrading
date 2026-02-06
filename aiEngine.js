// ===================================
// CX Trading AI Engine
// ===================================

// Función de activación sigmoid
const sigmoid = (x) => 1 / (1 + Math.exp(-x));


const trainAI = (features, actualOutcome, aiBrainRef, setAiLearnedCount) => {
    const brain = aiBrainRef.current;
    const rawSum = (features.vel * brain.weights.velocity) + 
                   (features.acc * brain.weights.acceleration) + 
                   (features.z * brain.weights.zScore) + 
                   (features.dur * brain.weights.duration) + 
                   brain.weights.bias;
    
    const predictedConfidence = sigmoid(rawSum);
    const error = actualOutcome - predictedConfidence;
    
    brain.weights.velocity += brain.learningRate * error * features.vel;
    brain.weights.acceleration += brain.learningRate * error * features.acc;
    brain.weights.zScore += brain.learningRate * error * features.z;
    brain.weights.duration += brain.learningRate * error * features.dur;
    brain.weights.bias += brain.learningRate * error;
    
    setAiLearnedCount(c => c + 1);
};