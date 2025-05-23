import cv2
import onnxruntime as ort
import numpy as np
from .saccade_tools import pt, saccade_tool, policy_type

ort_sess = ort.InferenceSession("deepgaze.onnx")

# Open the default camera
cam = cv2.VideoCapture(0)

# Get the default frame width and height
frame_width = int(cam.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cam.get(cv2.CAP_PROP_FRAME_HEIGHT))

centerbias = np.load("centerbias.npy")
saccade_state = saccade_tool(1, op_code=policy_type.SALIENCY)

while True:
    ret, frame = cam.read()

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

    # Display the captured frame
    cv2.imshow("Camera", input_frame)

    # Press 'q' to exit the loop
    if cv2.waitKey(1) == ord("q"):
        break

# Release the capture and writer objects
cam.release()
cv2.destroyAllWindows()
