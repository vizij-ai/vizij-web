import cv2
import onnxruntime as ort
import numpy as np


def get_salience_heatmap_from_image(frame):

    centerbias = np.load("models/salience/centerbias.npy")
    ort_sess = ort.InferenceSession("models/salience/deepgaze.onnx")

    input_frame = cv2.resize(frame, (1024, 768), interpolation=cv2.INTER_LINEAR)
    final_input_frame = input_frame.transpose((2, 0, 1))
    final_input_frame = final_input_frame[None, :, :, :]

    outputs = ort_sess.run(
        None, {"x": final_input_frame, "onnx::Reshape_1": centerbias}
    )
    output = outputs[0]
    output_frame = output.transpose((1, 2, 0))
    saliency = (output_frame + 30.0) / 23.0
    output_frame = (saliency * 255).astype(np.uint8)

    return output_frame