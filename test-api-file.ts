import fs from 'fs';
import { Blob } from 'buffer';

async function test() {
  try {
    const formData = new FormData();
    formData.append("brand", "test");
    
    // Create a dummy file
    const fileContent = "dummy content";
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append("photos", blob, "test.txt");

    const res = await fetch("http://localhost:3000/api/devices", {
      method: "POST",
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
