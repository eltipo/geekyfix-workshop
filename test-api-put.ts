async function test() {
  try {
    const formData = new FormData();
    formData.append("brand", "test-updated");
    const res = await fetch("http://localhost:3000/api/devices/c0204a33-55c5-4da9-8982-342b421f74c3", {
      method: "PUT",
      body: formData
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text.substring(0, 100));
  } catch (e) {
    console.error(e);
  }
}
test();
