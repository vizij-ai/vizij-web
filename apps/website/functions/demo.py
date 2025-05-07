import cv2
import onnxruntime as ort
import numpy as np

ort_sess = ort.InferenceSession("deepgaze.onnx")

# Open the default camera
cam = cv2.VideoCapture(0)

# Get the default frame width and height
frame_width = int(cam.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cam.get(cv2.CAP_PROP_FRAME_HEIGHT))

centerbias = np.load("centerbias.npy")

while True:
    ret, frame = cam.read()

    input_frame = cv2.resize(frame, (1024, 768), interpolation=cv2.INTER_LINEAR)
    print("Input frame shape: " + str(input_frame.shape))
    input_frame = input_frame.transpose((2, 0, 1))
    input_frame = input_frame[None, :, :, :]

    outputs = ort_sess.run(None, {"x": input_frame, "onnx::Reshape_1": centerbias})
    print("Outtputs type: " + str(len(outputs)))
    output = outputs[0]
    print(output.shape)
    output_frame = output.transpose((1, 2, 0))
    print("Output frame shape: " + str(output_frame.shape))
    saliency = output_frame / 30.0 + 1.0
    print("Saliency min/max: " + str(saliency.min()) + " " + str(saliency.max()))
    output_frame = (saliency * 255).astype(np.uint8)
    print("Final Saliency min/max: " + str(saliency.min()) + " " + str(saliency.max()))
    # Display the captured frame
    cv2.imshow("Camera", saliency)

    # Press 'q' to exit the loop
    if cv2.waitKey(1) == ord("q"):
        break

# Release the capture and writer objects
cam.release()
cv2.destroyAllWindows()
