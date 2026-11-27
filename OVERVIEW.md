Open DSH Superagent in the Paseo sidebar to review tickets and continue the same Router conversation you use in DSH. The Paseo host connects to DSH, so a phone only needs access to Paseo.

Use Paseo 0.17.5 or later and a DSH Web instance with Superagent installed and its Router ready. In the plugin settings, enter the DSH address. Find the `dsh web:` link in the DSH startup terminal or log and copy the value of its `token` parameter into the token field. The host stores the resulting login credential. People with access to that Paseo host share the connection and its Router permissions.

The panel is in Simplified Chinese and shows incoming work, decisions and execution history. You can send tasks, view images and delivered files, retry or stop tickets, and edit Superagent settings. A ticket with a local Paseo agent binding can open that agent.

Messages and uploads go to the selected DSH instance. DSH may send conversation content and tool results to its configured model provider. Desktop and web clients support file uploads. On native iOS and Android with Paseo 0.17.5, use the browser when you need to attach a file.
