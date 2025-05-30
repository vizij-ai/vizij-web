import cv2
import onnxruntime as ort
import numpy as np
from saccade_tools import saccade_tool, policy_type

saccade_state = saccade_tool(1, op_code=policy_type.SALIENCY)
centerbias = np.load("models/salience/centerbias.npy")
ort_sess = ort.InferenceSession("models/salience/deepgaze.onnx")

def get_salience_heatmap_from_image(frame):
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


def get_image_with_gaze_location_rectangle(frame):
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

    next_state = saccade_state.update(output_frame)
    for a_pt in next_state:
        top_left = (a_pt.col - 2, a_pt.row - 2)
        bottom_right = (a_pt.col + 2, a_pt.row + 2)
        cv2.rectangle(input_frame, top_left, bottom_right, (0, 255, 0), 2)

    return input_frame

def get_gaze_location_from_image(frame):
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

    next_state = saccade_state.update(output_frame)
    point = next_state[0]

    return {"y": point.row / 768 , "x": point.col / 1024 }